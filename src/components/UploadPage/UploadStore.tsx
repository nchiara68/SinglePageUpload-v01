// components/UploadStore.tsx - Enhanced with session-based permissions and fixed height - CURRENT SESSION ONLY
import React, { useState, useEffect, useCallback } from 'react';
import { uploadData, list, remove, getUrl } from 'aws-amplify/storage';
import { generateClient } from 'aws-amplify/data';
import * as XLSX from 'xlsx';
import type { Schema } from '../../../amplify/data/resource';

const client = generateClient<Schema>();

// Extend Window interface to include our refresh function
declare global {
  interface Window {
    refreshInvoiceViewer?: () => void;
    activateInvoiceAutoRefresh?: () => void;
    clearUploadedFiles?: () => void;
  }
}

interface FileItem {
  path: string;
  size?: number;
  lastModified?: Date;
  eTag?: string;
}

interface EnhancedFileItem extends FileItem {
  isCurrentSession: boolean;
  hasActiveInvoices: boolean;
  hasSubmittedInvoices: boolean;
  associatedJobId?: string;
  processingStatus?: string;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  isUploading: boolean;
  isProcessing: boolean;
  processingProgress: number;
}

interface ProcessingError {
  row: number;
  invoice_id?: string;
  errors: string[];
}

interface InvoiceData {
  invoiceId: string;
  sellerId: string;
  debtorId: string;
  currency: string;
  amount: number;
  product: string;
  issueDate: string;
  dueDate: string;
  isValid: boolean;
  validationErrors: string[];
}

interface CsvRow {
  [key: string]: string;
}

export const UploadStore: React.FC = () => {
  const [files, setFiles] = useState<EnhancedFileItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());

  // Check if a file is from current session (has active invoices vs submitted invoices)
  const checkFileSessionStatus = async (filePath: string): Promise<{
    isCurrentSession: boolean;
    hasActiveInvoices: boolean;
    hasSubmittedInvoices: boolean;
    associatedJobId?: string;
    processingStatus?: string;
  }> => {
    try {
      console.log('🔍 [SESSION] Checking session status for file:', filePath);
      
      // Step 1: Find associated upload jobs
      const jobsResult = await client.models.InvoiceUploadJob.list({
        filter: {
          s3Key: { eq: filePath }
        }
      });

      if (jobsResult.errors || !jobsResult.data || jobsResult.data.length === 0) {
        console.log('⚠️ [SESSION] No associated jobs found for file:', filePath);
        // If no job found, assume it's a previous session file (safer default)
        return {
          isCurrentSession: false,
          hasActiveInvoices: false,
          hasSubmittedInvoices: false
        };
      }

      const job = jobsResult.data[0];
      console.log('📋 [SESSION] Found job:', { id: job.id, status: job.status, fileName: job.fileName });

      // Step 2: Enhanced logic for determining current session
      // Consider a file "current session" if:
      // 1. It has a recent processing timestamp (within last 24 hours), OR
      // 2. It has active invoices, OR  
      // 3. It has a job status that indicates recent activity

      const now = new Date();
      const job24HoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Check if job was processed recently
      const isRecentlyProcessed = job.processingCompletedAt && 
                                 new Date(job.processingCompletedAt) > job24HoursAgo;
      
      // Check if job was started recently (for in-progress jobs)
      const isRecentlyStarted = job.processingStartedAt && 
                               new Date(job.processingStartedAt) > job24HoursAgo;
      
      console.log('🕐 [SESSION] Time-based checks:', {
        jobProcessingCompleted: job.processingCompletedAt,
        jobProcessingStarted: job.processingStartedAt,
        isRecentlyProcessed,
        isRecentlyStarted,
        cutoffTime: job24HoursAgo.toISOString()
      });

      // Check for active invoices (in Invoice table)
      const activeInvoicesResult = await client.models.Invoice.list({
        filter: {
          uploadJobId: { eq: job.id }
        }
      });

      const hasActiveInvoices = !activeInvoicesResult.errors && 
                               activeInvoicesResult.data && 
                               activeInvoicesResult.data.length > 0;

      console.log('📊 [SESSION] Active invoices check:', { 
        hasActiveInvoices, 
        count: activeInvoicesResult.data?.length || 0 
      });

      // Check for submitted invoices (in SubmittedInvoice table)
      const submittedInvoicesResult = await client.models.SubmittedInvoice.list({
        filter: {
          originalUploadJobId: { eq: job.id }
        }
      });

      const hasSubmittedInvoices = !submittedInvoicesResult.errors && 
                                   submittedInvoicesResult.data && 
                                   submittedInvoicesResult.data.length > 0;

      console.log('📊 [SESSION] Submitted invoices check:', { 
        hasSubmittedInvoices, 
        count: submittedInvoicesResult.data?.length || 0 
      });

      // Enhanced session determination logic:
      // A file is "current session" if:
      // 1. It has active invoices (not yet submitted), OR
      // 2. It was processed recently (within 24 hours) AND has no submitted invoices yet, OR
      // 3. It's currently being processed (PROCESSING status)
      const isCurrentSession = hasActiveInvoices || 
                              (isRecentlyProcessed && !hasSubmittedInvoices) ||
                              (isRecentlyStarted && !hasSubmittedInvoices) ||
                              job.status === 'PROCESSING' ||
                              job.status === 'PENDING';

      console.log('✅ [SESSION] Enhanced status determination:', {
        filePath,
        hasActiveInvoices,
        hasSubmittedInvoices,
        isRecentlyProcessed,
        isRecentlyStarted,
        jobStatus: job.status,
        isCurrentSession,
        jobId: job.id,
        processingStatus: job.status,
        logic: 'Current session = has active invoices OR recent processing OR in-progress status'
      });

      return {
        isCurrentSession,
        hasActiveInvoices,
        hasSubmittedInvoices,
        associatedJobId: job.id,
        processingStatus: job.status
      };

    } catch (error) {
      console.error('❌ [SESSION] Error checking session status:', error);
      // Default to previous session on error for safety (prevents accidental deletion)
      return {
        isCurrentSession: false,
        hasActiveInvoices: false,
        hasSubmittedInvoices: false
      };
    }
  };

  // Load user's files with session status - ONLY CURRENT SESSION FILES
  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📁 [DEBUG] Loading files with session status...');
      
      const result = await list({
        path: ({ identityId }) => {
          if (!identityId) {
            throw new Error('User not authenticated');
          }
          return `user-files/${identityId}/`;
        },
        options: {
          listAll: true
        }
      });

      const baseFiles = result.items || [];
      console.log('📁 [DEBUG] Found', baseFiles.length, 'base files');

      // Check session status for each file
      const enhancedFiles: EnhancedFileItem[] = await Promise.all(
        baseFiles.map(async (file) => {
          const sessionStatus = await checkFileSessionStatus(file.path);
          return {
            ...file,
            ...sessionStatus
          };
        })
      );

      console.log('📁 [DEBUG] Enhanced files with session status:', {
        total: enhancedFiles.length,
        currentSession: enhancedFiles.filter(f => f.isCurrentSession).length,
        previousSession: enhancedFiles.filter(f => !f.isCurrentSession).length
      });

      // FILTER TO ONLY SHOW CURRENT SESSION FILES
      const currentSessionFiles = enhancedFiles.filter(file => file.isCurrentSession);

      console.log('📁 [DEBUG] Filtered to current session only:', {
        originalCount: enhancedFiles.length,
        filteredCount: currentSessionFiles.length,
        removedPreviousSession: enhancedFiles.length - currentSessionFiles.length
      });

      // Sort current session files by date (newest first)
      const sortedFiles = currentSessionFiles.sort((a, b) => {
        const aDate = a.lastModified?.getTime() || 0;
        const bDate = b.lastModified?.getTime() || 0;
        return bDate - aDate;
      });

      console.log('📁 [DEBUG] Files sorted by date (current session only):', {
        sortOrder: 'Newest first',
        currentSessionFiles: sortedFiles.map(f => getFileName(f.path))
      });

      setFiles(sortedFiles);
    } catch (err) {
      setError('Failed to load files');
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Download file functionality
  const handleDownloadFile = async (filePath: string) => {
    setDownloadingFiles(prev => new Set(prev).add(filePath));
    
    try {
      console.log('📥 [DOWNLOAD] Starting download for:', filePath);
      
      const downloadUrl = await getUrl({
        path: filePath,
        options: {
          expiresIn: 3600, // URL expires in 1 hour
        },
      });

      // Create a temporary download link
      const link = document.createElement('a');
      link.href = downloadUrl.url.toString();
      link.download = getFileName(filePath);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('✅ [DOWNLOAD] Download initiated for:', filePath);
      
    } catch (error) {
      console.error('❌ [DOWNLOAD] Download failed:', error);
      setError(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  // NEW: Clear files list function
  const clearFilesList = useCallback(() => {
    console.log('🧹 [DEBUG] Clearing uploaded files list...');
    setFiles([]);
    setError(null);
    console.log('✅ [DEBUG] Files list cleared');
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Expose functions globally for other components to use
  useEffect(() => {
    // Store the refresh function globally so other components can call it
    window.refreshInvoiceViewer = () => {
      console.log('🔄 [DEBUG] External refresh triggered');
      setTimeout(() => {
        loadFiles();
      }, 500); // Small delay to ensure deletion is processed
    };

    // Expose clear files function globally
    window.clearUploadedFiles = clearFilesList;

    // Cleanup
    return () => {
      delete window.refreshInvoiceViewer;
      delete window.clearUploadedFiles;
    };
  }, [loadFiles, clearFilesList]);

  // Frontend processing logic
  const processInvoiceFile = async (fileKey: string, fileName: string, progressIndex: number) => {
    console.log('🚀 [DEBUG] Starting processInvoiceFile:', { fileKey, fileName, progressIndex });
    
    let job: Schema["InvoiceUploadJob"]["type"] | null = null;
    
    try {
      const fileType = fileName.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX';
      console.log('📄 [DEBUG] File type determined:', fileType);
      
      // Update progress - processing started
      setUploadProgress(prev => 
        prev.map((item, i) => 
          i === progressIndex ? { ...item, isProcessing: true, processingProgress: 10 } : item
        )
      );
      console.log('✅ [DEBUG] Processing progress set to 10%');

      // Create upload job with proper enum values
      console.log('📝 [DEBUG] Creating InvoiceUploadJob...');
      const jobResult = await client.models.InvoiceUploadJob.create({
        fileName,
        fileType: fileType as 'CSV' | 'XLSX',
        s3Key: fileKey,
        status: 'PROCESSING',
        totalInvoices: 0,
        successfulInvoices: 0,
        failedInvoices: 0,
        processingStartedAt: new Date().toISOString(),
      });

      console.log('📝 [DEBUG] Job creation result:', {
        hasErrors: !!jobResult.errors,
        errors: jobResult.errors,
        hasData: !!jobResult.data,
        jobId: jobResult.data?.id
      });

      if (jobResult.errors || !jobResult.data) {
        console.error('❌ [DEBUG] Failed to create upload job:', jobResult.errors);
        throw new Error(`Failed to create upload job: ${jobResult.errors?.[0]?.message || 'Unknown error'}`);
      }

      job = jobResult.data;
      console.log('✅ [DEBUG] Upload job created successfully:', job.id);
      
      // Update progress
      setUploadProgress(prev => 
        prev.map((item, i) => 
          i === progressIndex ? { ...item, processingProgress: 20 } : item
        )
      );
      console.log('✅ [DEBUG] Processing progress set to 20%');

      // Download and parse file
      console.log('📥 [DEBUG] Starting file download and parsing...');
      const invoiceData = await downloadAndParseFile(fileKey, fileType);
      console.log('📥 [DEBUG] File parsing completed:', {
        totalRecords: invoiceData.length,
        validRecords: invoiceData.filter(inv => inv.isValid).length,
        invalidRecords: invoiceData.filter(inv => !inv.isValid).length,
        sampleData: invoiceData.slice(0, 2)
      });
      
      // Update progress
      setUploadProgress(prev => 
        prev.map((item, i) => 
          i === progressIndex ? { ...item, processingProgress: 40 } : item
        )
      );
      console.log('✅ [DEBUG] Processing progress set to 40%');

      // Process invoices in batches
      if (!job?.id) {
        throw new Error('Job ID is missing - cannot process invoices');
      }
      
      const batchSize = 25;
      let successfulCount = 0;
      let failedCount = 0;
      const allErrors: ProcessingError[] = [];
      
      const totalBatches = Math.ceil(invoiceData.length / batchSize);
      console.log('🔄 [DEBUG] Starting batch processing:', {
        totalRecords: invoiceData.length,
        batchSize,
        totalBatches
      });
      
      for (let i = 0; i < invoiceData.length; i += batchSize) {
        const batch = invoiceData.slice(i, i + batchSize);
        const currentBatchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`🔄 [DEBUG] Processing batch ${currentBatchNumber}/${totalBatches}:`, {
          batchStart: i,
          batchSize: batch.length,
          validInBatch: batch.filter(inv => inv.isValid).length
        });
        
        const batchPromises = batch.map(async (invoice, index) => {
          const globalIndex = i + index + 1;
          
          if (!job) {
            throw new Error('Job reference is null during invoice processing');
          }
          
          try {
            if (!invoice.isValid) {
              console.log(`⚠️ [DEBUG] Invalid invoice at row ${globalIndex}:`, invoice.validationErrors);
              failedCount++;
              allErrors.push({
                row: globalIndex,
                errors: invoice.validationErrors
              });
              return null;
            }

            console.log(`📝 [DEBUG] Creating invoice record for row ${globalIndex}:`, {
              invoiceId: invoice.invoiceId,
              amount: invoice.amount,
              currency: invoice.currency
            });

            const result = await client.models.Invoice.create({
              invoiceId: invoice.invoiceId,
              sellerId: invoice.sellerId,
              debtorId: invoice.debtorId,
              currency: invoice.currency as 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'CHF' | 'CNY',
              amount: invoice.amount,
              product: invoice.product,
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              uploadDate: new Date().toISOString().split('T')[0],
              uploadJobId: job.id,
              isValid: invoice.isValid,
              validationErrors: invoice.validationErrors,
            });

            if (result.errors) {
              console.error(`❌ [DEBUG] Failed to create invoice at row ${globalIndex}:`, result.errors);
              failedCount++;
              allErrors.push({
                row: globalIndex,
                invoice_id: invoice.invoiceId,
                errors: result.errors.map((error) => error.message || 'Unknown error')
              });
              return null;
            }

            console.log(`✅ [DEBUG] Successfully created invoice at row ${globalIndex}`);
            successfulCount++;
            return result.data;
          } catch (error) {
            console.error(`❌ [DEBUG] Exception creating invoice at row ${globalIndex}:`, error);
            failedCount++;
            allErrors.push({
              row: globalIndex,
              invoice_id: invoice.invoiceId,
              errors: [error instanceof Error ? error.message : 'Unknown error']
            });
            return null;
          }
        });

        await Promise.allSettled(batchPromises);
        
        console.log(`✅ [DEBUG] Batch ${currentBatchNumber} completed:`, {
          successfulSoFar: successfulCount,
          failedSoFar: failedCount
        });
        
        // Update progress
        const progressPercent = 40 + (currentBatchNumber / totalBatches) * 50;
        setUploadProgress(prev => 
          prev.map((item, j) => 
            j === progressIndex ? { ...item, processingProgress: progressPercent } : item
          )
        );
        console.log(`✅ [DEBUG] Processing progress set to ${progressPercent.toFixed(1)}%`);
      }

      console.log('🏁 [DEBUG] All batches completed:', {
        totalProcessed: successfulCount + failedCount,
        successfulCount,
        failedCount,
        errorCount: allErrors.length
      });

      // Update job status
      if (!job?.id) {
        throw new Error('Job ID is missing - cannot update job status');
      }
      
      const finalStatus = failedCount === 0 ? 'COMPLETED' : (successfulCount === 0 ? 'FAILED' : 'COMPLETED');
      console.log(`📝 [DEBUG] Updating job status to: ${finalStatus}`);
      
      const errorSummary = allErrors.length > 0 ? 
        `${allErrors.length} validation errors. Sample: ${allErrors.slice(0, 3).map(e => `Row ${e.row}: ${e.errors[0]}`).join('; ')}` : 
        null;
      
      const updateData = {
        id: job.id,
        status: finalStatus as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
        totalInvoices: invoiceData.length,
        successfulInvoices: successfulCount,
        failedInvoices: failedCount,
        processingCompletedAt: new Date().toISOString(),
        ...(errorSummary && { errorMessage: errorSummary }),
      };
      
      console.log('📝 [DEBUG] Job update data:', updateData);
      
      try {
        const updateResult = await client.models.InvoiceUploadJob.update(updateData);
        console.log('📝 [DEBUG] Job update result:', {
          hasErrors: !!updateResult.errors,
          errors: updateResult.errors,
          hasData: !!updateResult.data
        });

        if (updateResult.errors) {
          console.error('❌ [DEBUG] Failed to update job status:', updateResult.errors);
          updateResult.errors.forEach((error, index) => {
            console.error(`❌ [DEBUG] Update error ${index + 1}:`, {
              message: error.message,
              path: error.path,
              errorType: error.errorType,
              extensions: error.extensions
            });
          });
          
          console.warn('⚠️ [DEBUG] Job status update failed, but processing completed successfully');
        } else {
          console.log('✅ [DEBUG] Job status updated successfully');
        }
      } catch (updateError) {
        console.error('💥 [DEBUG] Exception during job update:', updateError);
        console.warn('⚠️ [DEBUG] Job status update failed with exception, but processing completed successfully');
      }

      // Mark processing as complete
      setUploadProgress(prev => 
        prev.map((item, i) => 
          i === progressIndex ? { ...item, isProcessing: false, processingProgress: 100 } : item
        )
      );
      console.log('✅ [DEBUG] Processing progress set to 100% - COMPLETE');

      console.log(`🎉 [DEBUG] Processing completed successfully: ${successfulCount} successful, ${failedCount} failed`);

      // Trigger immediate invoice viewer refresh after processing
      console.log('🔄 [DEBUG] Triggering immediate refresh after invoice processing...');
      if (window.refreshInvoiceViewer) {
        window.refreshInvoiceViewer();
        
        // Additional refreshes with different timings to handle data propagation delays
        setTimeout(() => {
          console.log('🔄 [DEBUG] First delayed refresh after processing (500ms)...');
          if (window.refreshInvoiceViewer) {
            window.refreshInvoiceViewer();
          }
        }, 500);
        
        setTimeout(() => {
          console.log('🔄 [DEBUG] Second delayed refresh after processing (1500ms)...');
          if (window.refreshInvoiceViewer) {
            window.refreshInvoiceViewer();
          }
        }, 1500);
        
        setTimeout(() => {
          console.log('🔄 [DEBUG] Final delayed refresh after processing (3000ms)...');
          if (window.refreshInvoiceViewer) {
            window.refreshInvoiceViewer();
          }
        }, 3000);
      }

    } catch (error) {
      console.error('💥 [DEBUG] Error in processInvoiceFile:', {
        error: error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Try to update job status to FAILED if we have a job reference
      if (job?.id) {
        try {
          console.log('🔄 [DEBUG] Attempting to mark job as FAILED due to processing error...');
          await client.models.InvoiceUploadJob.update({
            id: job.id,
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Unknown processing error',
            processingCompletedAt: new Date().toISOString(),
          });
          console.log('✅ [DEBUG] Job marked as FAILED successfully');
        } catch (updateError) {
          console.error('💥 [DEBUG] Failed to update job status to FAILED:', updateError);
        }
      } else {
        console.warn('⚠️ [DEBUG] Cannot update job status to FAILED - job reference is missing');
      }
      
      // Mark processing as failed
      setUploadProgress(prev => 
        prev.map((item, i) => 
          i === progressIndex ? { ...item, isProcessing: false, processingProgress: 0 } : item
        )
      );
      console.log('❌ [DEBUG] Processing marked as failed due to error');
      
      throw error;
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('📤 [DEBUG] handleFileSelect triggered');
    
    const selectedFiles = event.target.files;
    if (!selectedFiles) {
      console.log('❌ [DEBUG] No files selected');
      return;
    }

    const fileArray = Array.from(selectedFiles);
    console.log('📤 [DEBUG] Files selected:', {
      count: fileArray.length,
      files: fileArray.map(f => ({ name: f.name, size: f.size, type: f.type }))
    });
    
    // Filter for invoice files only (CSV and Excel)
    const invoiceFiles = fileArray.filter(file => 
      /\.(csv|xlsx)$/i.test(file.name)
    );
    
    console.log('📤 [DEBUG] Invoice files after filtering:', {
      originalCount: fileArray.length,
      filteredCount: invoiceFiles.length,
      invoiceFiles: invoiceFiles.map(f => f.name)
    });
    
    if (invoiceFiles.length === 0) {
      console.log('❌ [DEBUG] No valid invoice files found');
      setError('Please select CSV or Excel files containing invoice data');
      return;
    }
    
    if (invoiceFiles.length !== selectedFiles.length) {
      console.log('⚠️ [DEBUG] Some files were filtered out');
      setError('Only CSV and Excel files are supported for invoice processing');
      return;
    }

    // Initialize upload progress for all files
    const initialProgress = invoiceFiles.map(file => ({
      fileName: file.name,
      progress: 0,
      isUploading: true,
      isProcessing: false,
      processingProgress: 0
    }));
    setUploadProgress(initialProgress);
    console.log('✅ [DEBUG] Upload progress initialized for', invoiceFiles.length, 'files');

    // Upload files sequentially to avoid overwhelming the system
    for (let index = 0; index < invoiceFiles.length; index++) {
      const file = invoiceFiles[index];
      console.log(`📤 [DEBUG] Starting upload for file ${index + 1}/${invoiceFiles.length}:`, file.name);
      
      try {
        const fileName = `${Date.now()}-${file.name}`;
        console.log('📤 [DEBUG] Generated unique filename:', fileName);
        
        const result = await uploadData({
          path: ({ identityId }) => {
            console.log('📤 [DEBUG] Upload path function called with identityId:', identityId);
            if (!identityId) {
              throw new Error('User not authenticated');
            }
            const fullPath = `user-files/${identityId}/${fileName}`;
            console.log('📤 [DEBUG] Full upload path:', fullPath);
            return fullPath;
          },
          data: file,
          options: {
            onProgress: ({ transferredBytes, totalBytes }) => {
              if (totalBytes) {
                const progress = Math.round((transferredBytes / totalBytes) * 100);
                console.log(`📤 [DEBUG] Upload progress for ${file.name}:`, `${progress}% (${transferredBytes}/${totalBytes})`);
                setUploadProgress(prev => 
                  prev.map((item, i) => 
                    i === index ? { ...item, progress } : item
                  )
                );
              }
            },
          },
        }).result;

        console.log('✅ [DEBUG] Upload successful for', file.name, ':', result.path);
        
        // Mark upload as completed
        setUploadProgress(prev => 
          prev.map((item, i) => 
            i === index ? { ...item, isUploading: false, progress: 100 } : item
          )
        );

        // Start processing the uploaded file
        console.log('🔄 [DEBUG] Starting processing for uploaded file:', result.path);
        await processInvoiceFile(result.path, file.name, index);
        console.log('✅ [DEBUG] Processing completed for:', file.name);

        // Immediate refresh after each file processing
        console.log('🔄 [DEBUG] Immediate refresh after individual file processing...');
        if (window.refreshInvoiceViewer) {
          window.refreshInvoiceViewer();
        }
        
        // Also refresh file list to update session status
        setTimeout(async () => {
          console.log('🔄 [DEBUG] File list refresh after individual processing (1000ms)...');
          await loadFiles();
        }, 1000);

      } catch (err) {
        console.error(`💥 [DEBUG] Upload/processing failed for ${file.name}:`, {
          error: err,
          message: err instanceof Error ? err.message : 'Unknown error',
          stack: err instanceof Error ? err.stack : undefined
        });
        
        setUploadProgress(prev => 
          prev.map((item, i) => 
            i === index ? { ...item, isUploading: false, isProcessing: false, progress: 0 } : item
          )
        );
      }
    }

    try {
      setError(null);
      console.log('🧹 [DEBUG] Cleaning up after all uploads...');
      
      // Clear upload progress after a delay
      setTimeout(() => {
        console.log('🧹 [DEBUG] Clearing upload progress display');
        setUploadProgress([]);
      }, 3000);
      
      // Enhanced file list refresh sequence
      console.log('🔄 [DEBUG] Starting enhanced file list refresh sequence...');
      
      // Immediate file list reload
      await loadFiles();
      console.log('✅ [DEBUG] Immediate file list reloaded');
      
      // Additional file list refreshes with delays
      setTimeout(async () => {
        console.log('🔄 [DEBUG] Secondary file list refresh (500ms)...');
        await loadFiles();
        console.log('✅ [DEBUG] Secondary file list refresh completed');
      }, 500);
      
      setTimeout(async () => {
        console.log('🔄 [DEBUG] Final file list refresh (2000ms)...');
        await loadFiles();
        console.log('✅ [DEBUG] Final file list refresh completed');
      }, 2000);
      
      // Clear the file input
      event.target.value = '';
      console.log('🧹 [DEBUG] File input cleared');
      
      // Enhanced multiple refresh strategies for invoice viewer
      console.log('🚀 [DEBUG] Triggering comprehensive invoice viewer refresh...');
      
      // Strategy 1: Immediate refresh
      if (window.refreshInvoiceViewer) {
        console.log('🔄 [DEBUG] Immediate invoice viewer refresh...');
        window.refreshInvoiceViewer();
      }
      
      // Strategy 2: Delayed refresh to ensure data propagation
      setTimeout(() => {
        console.log('🔄 [DEBUG] Delayed invoice viewer refresh (500ms)...');
        if (window.refreshInvoiceViewer) {
          window.refreshInvoiceViewer();
        }
        // Also refresh files to pick up session status changes
        loadFiles();
      }, 500);
      
      // Strategy 3: Secondary refresh for timing issues
      setTimeout(() => {
        console.log('🔄 [DEBUG] Secondary invoice viewer refresh (1500ms)...');
        if (window.refreshInvoiceViewer) {
          window.refreshInvoiceViewer();
        }
        // Refresh files again to ensure current session detection
        loadFiles();
      }, 1500);
      
      // Strategy 4: Final refresh to catch any stragglers
      setTimeout(() => {
        console.log('🔄 [DEBUG] Final invoice viewer refresh (3000ms)...');
        if (window.refreshInvoiceViewer) {
          window.refreshInvoiceViewer();
        }
        // Final files refresh for session status
        loadFiles();
      }, 3000);
      
      console.log('✅ [DEBUG] Multiple invoice refresh strategies activated');
      
    } catch (err) {
      console.error('💥 [DEBUG] Error during cleanup:', err);
      setError('Some files failed to process');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    const fileName = getFileName(filePath);
    
    if (!window.confirm(`Are you sure you want to delete "${fileName}"?\n\nThis will also delete all associated invoice data AND PDF files from the database and storage. This action cannot be undone.`)) {
      return;
    }

    setDeletingFiles(prev => new Set(prev).add(filePath));

    try {
      setError(null);
      console.log('🗑️ [DEBUG] Starting file deletion process for:', filePath);
      
      // Step 1: Find the InvoiceUploadJob associated with this file
      console.log('🔍 [DEBUG] Looking for InvoiceUploadJob with s3Key:', filePath);
      const jobsResult = await client.models.InvoiceUploadJob.list({
        filter: {
          s3Key: {
            eq: filePath
          }
        }
      });

      if (jobsResult.errors) {
        console.error('❌ [DEBUG] Error finding associated job:', jobsResult.errors);
        throw new Error('Failed to find associated processing job');
      }

      const associatedJobs = jobsResult.data || [];
      console.log('📊 [DEBUG] Found associated jobs:', associatedJobs.length);

      // Step 2: For each job, delete all associated PDFs, then invoices, then the job itself
      for (const job of associatedJobs) {
        console.log(`🔄 [DEBUG] Processing job: ${job.id} (${job.fileName})`);
        
        // Find all invoices for this job
        console.log('🔍 [DEBUG] Looking for invoices with uploadJobId:', job.id);
        const invoicesResult = await client.models.Invoice.list({
          filter: {
            uploadJobId: {
              eq: job.id
            }
          }
        });

        if (invoicesResult.errors) {
          console.error('❌ [DEBUG] Error finding associated invoices:', invoicesResult.errors);
          throw new Error('Failed to find associated invoices');
        }

        const associatedInvoices = invoicesResult.data || [];
        console.log(`📋 [DEBUG] Found ${associatedInvoices.length} invoices to delete for job ${job.id}`);

        // Delete associated PDFs from S3 first
        const invoicesWithPdfs = associatedInvoices.filter(invoice => invoice.pdfS3Key);
        console.log(`📄 [DEBUG] Found ${invoicesWithPdfs.length} invoices with PDFs to delete`);

        if (invoicesWithPdfs.length > 0) {
          console.log('🗑️ [DEBUG] Deleting associated PDF files from S3...');
          
          for (const invoice of invoicesWithPdfs) {
            try {
              console.log(`🗑️ [DEBUG] Deleting PDF for invoice ${invoice.invoiceId}: ${invoice.pdfS3Key}`);
              console.log(`📄 [DEBUG] PDF filename: ${invoice.pdfFileName}`);
              console.log(`📄 [DEBUG] Full S3 path: ${invoice.pdfS3FullPath}`);
              
              // Delete PDF from S3 using the relative path
              await remove({
                path: invoice.pdfS3Key!
              });
              
              console.log(`✅ [DEBUG] Successfully deleted PDF: ${invoice.pdfS3Key}`);
            } catch (error) {
              console.error(`❌ [DEBUG] Failed to delete PDF ${invoice.pdfS3Key}:`, error);
              // Continue with other deletions even if one PDF fails
            }
          }
        }

        // Delete all associated invoices
        if (associatedInvoices.length > 0) {
          console.log('🗑️ [DEBUG] Deleting associated invoices...');
          const invoiceDeletionPromises = associatedInvoices.map(async (invoice) => {
            try {
              console.log(`🗑️ [DEBUG] Deleting invoice: ${invoice.invoiceId} (${invoice.id})`);
              const deleteResult = await client.models.Invoice.delete({ id: invoice.id });
              
              if (deleteResult.errors) {
                console.error(`❌ [DEBUG] Failed to delete invoice ${invoice.id}:`, deleteResult.errors);
                throw new Error(`Failed to delete invoice: ${deleteResult.errors[0]?.message || 'Unknown error'}`);
              }
              
              console.log(`✅ [DEBUG] Successfully deleted invoice: ${invoice.id}`);
              return deleteResult;
            } catch (error) {
              console.error(`💥 [DEBUG] Exception deleting invoice ${invoice.id}:`, error);
              throw error;
            }
          });

          // Wait for all invoice deletions to complete
          const invoiceResults = await Promise.allSettled(invoiceDeletionPromises);
          const invoiceSuccessful = invoiceResults.filter(result => result.status === 'fulfilled').length;
          const invoiceFailed = invoiceResults.filter(result => result.status === 'rejected').length;
          
          console.log(`📊 [DEBUG] Invoice deletion results: ${invoiceSuccessful} successful, ${invoiceFailed} failed`);
          
          if (invoiceFailed > 0) {
            throw new Error(`Failed to delete ${invoiceFailed} out of ${associatedInvoices.length} invoices`);
          }
        }

        // Delete the job itself
        console.log(`🗑️ [DEBUG] Deleting job: ${job.id}`);
        const jobDeleteResult = await client.models.InvoiceUploadJob.delete({ id: job.id });
        
        if (jobDeleteResult.errors) {
          console.error(`❌ [DEBUG] Failed to delete job ${job.id}:`, jobDeleteResult.errors);
          throw new Error(`Failed to delete processing job: ${jobDeleteResult.errors[0]?.message || 'Unknown error'}`);
        }
        
        console.log(`✅ [DEBUG] Successfully deleted job: ${job.id}`);
      }

      // Step 3: Delete the file from S3
      console.log('🗑️ [DEBUG] Deleting file from S3:', filePath);
      await remove({
        path: filePath
      });
      console.log('✅ [DEBUG] Successfully deleted file from S3');

      // Step 4: Reload the file list and refresh invoice viewer with enhanced refresh
      console.log('🔄 [DEBUG] Starting comprehensive refresh process...');
      
      // Immediate file list reload
      console.log('🔄 [DEBUG] Immediate file list reload...');
      await loadFiles();
      console.log('✅ [DEBUG] Immediate file list reloaded');
      
      // Multiple invoice viewer refresh strategies
      console.log('🔄 [DEBUG] Triggering multiple invoice viewer refresh strategies...');
      if (window.refreshInvoiceViewer) {
        // Immediate refresh
        window.refreshInvoiceViewer();
        
        // Delayed refresh for data propagation
        setTimeout(() => {
          console.log('🔄 [DEBUG] Delayed invoice viewer refresh (500ms)...');
          if (window.refreshInvoiceViewer) {
            window.refreshInvoiceViewer();
          }
        }, 500);
        
        // Final refresh
        setTimeout(() => {
          console.log('🔄 [DEBUG] Final invoice viewer refresh (1500ms)...');
          if (window.refreshInvoiceViewer) {
            window.refreshInvoiceViewer();
          }
        }, 1500);
        
        console.log('✅ [DEBUG] Multiple invoice viewer refresh strategies activated');
      } else {
        console.warn('⚠️ [DEBUG] Invoice viewer refresh function not available');
      }
      
      // Simplified auto-refresh activation
      if (window.activateInvoiceAutoRefresh) {
        setTimeout(() => {
          console.log('🔄 [DEBUG] Activating simplified auto-refresh after deletion...');
          if (window.activateInvoiceAutoRefresh) {
            window.activateInvoiceAutoRefresh();
          }
        }, 1000);
      }
      
      // Additional file list refresh after delay to catch any async operations
      setTimeout(async () => {
        console.log('🔄 [DEBUG] Additional delayed file list refresh (1000ms)...');
        await loadFiles();
        console.log('✅ [DEBUG] Additional file list refresh completed');
      }, 1000);
      
      console.log('🎉 [DEBUG] File deletion process completed successfully');
      
      if (associatedJobs.length > 0) {
        const totalInvoices = associatedJobs.reduce((sum, job) => sum + (job.successfulInvoices || 0), 0);
        setError(null);
        console.log(`✅ [DEBUG] Successfully deleted file and ${totalInvoices} associated invoice records`);
      }
      
    } catch (err) {
      console.error('💥 [DEBUG] Error in file deletion process:', err);
      setError(`Failed to delete file and associated data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  // Helper functions for file processing
  const downloadAndParseFile = async (fileKey: string, fileType: string): Promise<InvoiceData[]> => {
    console.log('📥 [DEBUG] Starting downloadAndParseFile:', { fileKey, fileType });
    
    try {
      console.log('🔗 [DEBUG] Getting download URL for file...');
      const downloadResult = await getUrl({
        path: fileKey,
      });
      console.log('🔗 [DEBUG] Download URL obtained successfully');

      console.log('📡 [DEBUG] Fetching file from S3...');
      const response = await fetch(downloadResult.url.toString());
      console.log('📡 [DEBUG] Fetch response:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      console.log('📁 [DEBUG] Converting response to array buffer...');
      const fileBuffer = await response.arrayBuffer();
      console.log('📁 [DEBUG] File buffer obtained:', {
        size: fileBuffer.byteLength,
        sizeInKB: (fileBuffer.byteLength / 1024).toFixed(2)
      });
      
      let rawData: CsvRow[] = [];

      if (fileType === 'CSV') {
        console.log('📊 [DEBUG] Parsing CSV file...');
        const csvText = new TextDecoder().decode(fileBuffer);
        console.log('📊 [DEBUG] CSV text decoded:', {
          length: csvText.length,
          firstLine: csvText.split('\n')[0],
          totalLines: csvText.split('\n').length
        });
        rawData = parseCSV(csvText);
        console.log('📊 [DEBUG] CSV parsing completed:', { recordCount: rawData.length });
      } else if (fileType === 'XLSX') {
        console.log('📊 [DEBUG] Parsing Excel file...');
        const workbook = XLSX.read(fileBuffer, { type: 'array' });
        console.log('📊 [DEBUG] Workbook loaded:', {
          sheetNames: workbook.SheetNames,
          totalSheets: workbook.SheetNames.length
        });
        
        const sheetName = workbook.SheetNames[0];
        console.log('📊 [DEBUG] Using sheet:', sheetName);
        
        const worksheet = workbook.Sheets[sheetName];
        rawData = XLSX.utils.sheet_to_json(worksheet) as CsvRow[];
        console.log('📊 [DEBUG] Excel parsing completed:', { recordCount: rawData.length });
      }

      console.log('📊 [DEBUG] Raw data sample (first 2 rows):', rawData.slice(0, 2));
      console.log('🔍 [DEBUG] Starting data validation...');
      
      const validatedData = rawData.map((row, index) => {
        const validationResult = validateInvoiceData(row, index + 2);
        if (!validationResult.isValid) {
          console.log(`⚠️ [DEBUG] Validation failed for row ${index + 2}:`, validationResult.validationErrors);
        }
        return validationResult;
      });

      console.log('✅ [DEBUG] Data validation completed:', {
        totalRecords: validatedData.length,
        validRecords: validatedData.filter(d => d.isValid).length,
        invalidRecords: validatedData.filter(d => !d.isValid).length
      });

      return validatedData;

    } catch (error) {
      console.error('💥 [DEBUG] Error in downloadAndParseFile:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  };

  const parseCSV = (csvText: string): CsvRow[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });
  };

  const validateInvoiceData = (row: CsvRow, rowNumber: number): InvoiceData => {
    const errors: string[] = [];
    const invoice: InvoiceData = {
      invoiceId: '',
      sellerId: '',
      debtorId: '',
      currency: '',
      amount: 0,
      product: '',
      issueDate: '',
      dueDate: '',
      isValid: true,
      validationErrors: []
    };
    
    // Validate invoice_id (UUID)
    if (!row.invoice_id || !isValidUUID(row.invoice_id)) {
      errors.push(`Row ${rowNumber}: Invalid or missing invoice_id (must be UUID format)`);
    } else {
      invoice.invoiceId = row.invoice_id;
    }
    
    // Validate seller_id (UUID)
    if (!row.seller_id || !isValidUUID(row.seller_id)) {
      errors.push(`Row ${rowNumber}: Invalid or missing seller_id (must be UUID format)`);
    } else {
      invoice.sellerId = row.seller_id;
    }
    
    // Validate debtor_id (UUID)
    if (!row.debtor_id || !isValidUUID(row.debtor_id)) {
      errors.push(`Row ${rowNumber}: Invalid or missing debtor_id (must be UUID format)`);
    } else {
      invoice.debtorId = row.debtor_id;
    }
    
    // Validate currency
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];
    if (!row.currency || !validCurrencies.includes(row.currency.toUpperCase())) {
      errors.push(`Row ${rowNumber}: Invalid currency. Must be one of: ${validCurrencies.join(', ')}`);
    } else {
      invoice.currency = row.currency.toUpperCase();
    }
    
    // Validate amount
    const amount = parseFloat(row.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowNumber}: Invalid amount (must be positive number)`);
    } else {
      invoice.amount = amount;
    }
    
    // Validate product
    if (!row.product || row.product.trim().length === 0) {
      errors.push(`Row ${rowNumber}: Product field is required`);
    } else {
      invoice.product = row.product.trim();
    }
    
    // Validate issue_date
    if (!row.issue_date || !isValidDate(row.issue_date)) {
      errors.push(`Row ${rowNumber}: Invalid issue_date (must be YYYY-MM-DD format)`);
    } else {
      invoice.issueDate = formatDateString(row.issue_date);
    }
    
    // Validate due_date
    if (!row.due_date || !isValidDate(row.due_date)) {
      errors.push(`Row ${rowNumber}: Invalid due_date (must be YYYY-MM-DD format)`);
    } else {
      invoice.dueDate = formatDateString(row.due_date);
    }
    
    // Validate due_date is after issue_date
    if (invoice.issueDate && invoice.dueDate && invoice.dueDate <= invoice.issueDate) {
      errors.push(`Row ${rowNumber}: Due date must be after issue date`);
    }
    
    if (errors.length > 0) {
      invoice.isValid = false;
      invoice.validationErrors = errors;
    }
    
    return invoice;
  };

  const isValidUUID = (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  const isValidDate = (dateString: string): boolean => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  };

  const formatDateString = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getFileName = (path: string): string => {
    return path.split('/').pop() || path;
  };

  return (
    <div className="invoice-upload">
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="upload-section">
        <input
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="file-input"
          id="invoice-upload"
        />
        <label htmlFor="invoice-upload" className="upload-button">
          <div className="upload-icon"></div>
          <div className="upload-text">
            <h3>Upload Invoice Files</h3>
            <p>Drop CSV or Excel files here or click to browse</p>
          </div>
        </label>
      </div>

      {uploadProgress.length > 0 && (
        <div className="upload-progress-section">
          <h3>📤 Upload & Processing Progress</h3>
          {uploadProgress.map((item, index) => (
            <div key={index} className="upload-progress-item">
              <div className="progress-info">
                <span className="file-name">{item.fileName}</span>
                <span className="progress-percent">
                  {item.isUploading ? `Upload: ${item.progress}%` : 
                   item.isProcessing ? `Processing: ${Math.round(item.processingProgress)}%` : 
                   '✅ Complete'}
                </span>
              </div>
              
              {/* Upload Progress Bar */}
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              
              {/* Processing Progress Bar */}
              {(item.isProcessing || item.processingProgress > 0) && (
                <>
                  <div className="processing-label">Processing invoices...</div>
                  <div className="progress-bar processing">
                    <div 
                      className="progress-fill processing"
                      style={{ width: `${item.processingProgress}%` }}
                    />
                  </div>
                </>
              )}
              
              {!item.isUploading && !item.isProcessing && item.progress === 100 && (
                <span className="upload-complete">✅ Upload & Processing Complete!</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="files-section">
        <div className="files-header">
          <h3>📁 Files Manager <span className="subtitle"></span></h3>
          <div className="header-actions">
            <button onClick={loadFiles} className="refresh-btn" disabled={loading}>
              {loading ? '🔄 Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {loading && files.length === 0 ? (
          <div className="loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="no-files">
            No active files found. Upload invoice files to get started!
          </div>
        ) : (
          <div className="files-list-container">
            <div className="files-list">
              {files.map((file) => (
                <div key={file.path} className="file-item">
                  <div className="file-info">
                    <div className="file-header">
                      <div className="file-name">
                        <span className="file-icon">📄</span>
                        {getFileName(file.path)}
                      </div>
                      <div className="file-status">
                        {file.hasActiveInvoices && (
                          <span className="status-badge active">📋 Active Invoices</span>
                        )}
                        {file.hasSubmittedInvoices && (
                          <span className="status-badge submitted">✅ Submitted</span>
                        )}
                        {file.processingStatus && (
                          <span className={`status-badge processing ${file.processingStatus.toLowerCase()}`}>
                            {file.processingStatus}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="file-details">
                      <span className="file-size">{formatFileSize(file.size)}</span>
                      {file.lastModified && (
                        <span className="file-date">
                          {file.lastModified.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="file-actions">
                    <button
                      onClick={() => handleDownloadFile(file.path)}
                      className="download-btn"
                      title="Download file"
                      disabled={downloadingFiles.has(file.path)}
                    >
                      {downloadingFiles.has(file.path) ? '🔄 Downloading...' : '⤵ Download'}
                    </button>
                    
                    <button
                      onClick={() => handleDeleteFile(file.path)}
                      className="delete-btn"
                      title={deletingFiles.has(file.path) ? "Deleting file and data..." : "Delete file and all associated data"}
                      disabled={deletingFiles.has(file.path)}
                    >
                      {deletingFiles.has(file.path) ? '🔄 Deleting...' : '🗑️ Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .invoice-upload {
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #feb2b2;
        }

        .upload-section {
          margin-bottom: 30px;
        }

        .file-input {
          display: none;
        }

        .upload-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          padding: 40px;
          border: 3px dashed #32b3e7;
          border-radius: 12px;
          cursor: pointer;
          background: linear-gradient(135deg, #f8fcff 0%, #e6f7ff 100%);
          transition: all 0.3s ease;
          min-height: 120px;
        }

        .upload-button:hover {
          border-color: #1a9bd8;
          background: linear-gradient(135deg, #e6f7ff 0%, #d1f2ff 100%);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(50, 179, 231, 0.15);
        }

        .upload-icon {
          font-size: 48px;
          opacity: 0.8;
        }

        .upload-text {
          text-align: center;
        }

        .upload-text h3 {
          margin: 0 0 8px 0;
          color: #002b4b;
          font-size: 20px;
          font-weight: 600;
        }

        .upload-text p {
          margin: 0;
          color: #5e6e77;
          font-size: 14px;
        }

        .upload-progress-section {
          margin-bottom: 30px;
          padding: 20px;
          background: #f8fcff;
          border-radius: 8px;
          border: 1px solid #32b3e7;
        }

        .upload-progress-section h3 {
          margin: 0 0 15px 0;
          color: #002b4b;
        }

        .upload-progress-item {
          margin-bottom: 15px;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-size: 14px;
        }

        .file-name {
          color: #5e6e77;
          font-weight: 500;
        }

        .progress-percent {
          color: #002b4b;
          font-weight: 600;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e6f7ff;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 5px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #32b3e7, #1a9bd8);
          transition: width 0.3s ease;
        }

        .progress-bar.processing {
          height: 6px;
        }

        .progress-fill.processing {
          background: linear-gradient(90deg, #32b3e7, #002b4b);
        }

        .processing-label {
          font-size: 12px;
          color: #5e6e77;
          margin: 5px 0 2px 0;
        }

        .upload-complete {
          font-size: 12px;
          color: #32b3e7;
          margin-top: 5px;
          display: block;
          font-weight: 500;
        }

        .files-section {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
        }

        .files-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 15px;
        }

        .files-header h3 {
          margin: 0;
          color: #002b4b;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 15px;
          flex-wrap: wrap;
        }

        .subtitle {
          font-size: 14px;
          font-weight: 400;
          color: #5e6e77;
        }

        .refresh-btn {
          padding: 8px 16px;
          background: #f8fcff;
          border: 1px solid #32b3e7;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #5e6e77;
          transition: background 0.2s;
        }

        .refresh-btn:hover:not(:disabled) {
          background: #e6f7ff;
          color: #002b4b;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading, .no-files {
          text-align: center;
          padding: 40px;
          color: #5e6e77;
          font-style: italic;
        }

        /* FIXED HEIGHT CONTAINER WITH SCROLLING */
        .files-list-container {
          max-height: 350px;
          overflow-y: auto;
          border: 1px solid #e6f7ff;
          border-radius: 6px;
          background: #f8fcff;
        }

        .files-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px;
        }

        .file-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background: white;
          border: 1px solid #e6f7ff;
          border-radius: 6px;
          transition: all 0.2s;
          gap: 15px;
          border-left: 4px solid #10b981;
        }

        .file-item:hover {
          background: #f0f9ff;
          border-color: #32b3e7;
        }

        .file-info {
          flex: 1;
          min-width: 0;
        }

        .file-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          flex-wrap: wrap;
          gap: 8px;
        }

        .file-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
          color: #002b4b;
          font-size: 14px;
        }

        .file-icon {
          font-size: 16px;
        }

        .file-status {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .status-badge {
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 500;
          white-space: nowrap;
        }

        .status-badge.active {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-badge.submitted {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.processing {
          background: #fef3c7;
          color: #92400e;
        }

        .status-badge.processing.completed {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.processing.failed {
          background: #fee2e2;
          color: #dc2626;
        }

        .file-details {
          display: flex;
          gap: 15px;
          font-size: 12px;
          color: #6b7280;
        }

        .file-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          align-items: center;
        }

        .download-btn, .delete-btn {
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .download-btn {
          background: #32b3e7;
          color: white;
        }

        .download-btn:hover:not(:disabled) {
          background: #1a9bd8;
        }

        .delete-btn {
          background: #fed7d7;
          color: #c53030;
          border: 1px solid #feb2b2;
        }

        .delete-btn:hover:not(:disabled) {
          background: #feb2b2;
        }

        .download-btn:disabled, .delete-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Scrollbar Styling */
        .files-list-container::-webkit-scrollbar {
          width: 8px;
        }

        .files-list-container::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }

        .files-list-container::-webkit-scrollbar-thumb {
          background: #32b3e7;
          border-radius: 4px;
        }

        .files-list-container::-webkit-scrollbar-thumb:hover {
          background: #1a9bd8;
        }

        @media (max-width: 768px) {
          .invoice-upload {
            padding: 15px;
          }
          
          .upload-button {
            flex-direction: column;
            gap: 15px;
            padding: 30px 20px;
          }
          
          .upload-icon {
            font-size: 36px;
          }
          
          .upload-text h3 {
            font-size: 18px;
          }
          
          .files-header {
            flex-direction: column;
            align-items: stretch;
          }

          .header-actions {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          
          .file-item {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .file-header {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }

          .file-actions {
            justify-content: stretch;
            gap: 8px;
          }

          .download-btn, .delete-btn {
            flex: 1;
            text-align: center;
          }
          
          .file-details {
            flex-direction: column;
            gap: 5px;
          }

          .files-list-container {
            max-height: 300px;
          }
        }

        @media (max-width: 480px) {
          .files-list-container {
            max-height: 250px;
          }
          
          .file-item {
            padding: 12px;
          }
          
          .status-badge {
            font-size: 9px;
          }
        }
      `}</style>
    </div>
  );
};