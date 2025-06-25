// components/UploadStore.tsx - Updated with New Theme Colors
import React, { useState, useEffect, useCallback } from 'react';
import { uploadData, list, remove, getUrl } from 'aws-amplify/storage';
import { generateClient } from 'aws-amplify/data';
import * as XLSX from 'xlsx';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface FileItem {
  path: string;
  size?: number;
  lastModified?: Date;
  eTag?: string;
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
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingJobs, setProcessingJobs] = useState<Schema["InvoiceUploadJob"]["type"][]>([]);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());

  // Load user's files and processing jobs
  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
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

      setFiles(result.items || []);
    } catch (err) {
      setError('Failed to load files');
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load processing jobs with real-time updates
  const loadProcessingJobs = useCallback(() => {
    const subscription = client.models.InvoiceUploadJob.observeQuery().subscribe({
      next: ({ items }) => {
        setProcessingJobs(items.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        ));
      },
      error: (err) => {
        console.error('Error loading processing jobs:', err);
      }
    });

    return subscription;
  }, []);

  useEffect(() => {
    loadFiles();
    const subscription = loadProcessingJobs();
    
    return () => subscription.unsubscribe();
  }, [loadFiles, loadProcessingJobs]);

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
        fileType: fileType as 'CSV' | 'XLSX', // ✅ Type-safe enum value
        s3Key: fileKey,
        status: 'PROCESSING', // ✅ Use enum string value
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
        sampleData: invoiceData.slice(0, 2) // Log first 2 records for debugging
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
          
          // Ensure job is not null before processing
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
              uploadJobId: job.id, // Safe to access since we checked above
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

      // Update job status with proper enum values
      if (!job?.id) {
        throw new Error('Job ID is missing - cannot update job status');
      }
      
      const finalStatus = failedCount === 0 ? 'COMPLETED' : (successfulCount === 0 ? 'FAILED' : 'COMPLETED');
      console.log(`📝 [DEBUG] Updating job status to: ${finalStatus}`);
      
      // Create simplified error summary for storage
      const errorSummary = allErrors.length > 0 ? 
        `${allErrors.length} validation errors. Sample: ${allErrors.slice(0, 3).map(e => `Row ${e.row}: ${e.errors[0]}`).join('; ')}` : 
        null;
      
      const updateData = {
        id: job.id,
        status: finalStatus as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED', // ✅ Type-safe enum value
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
          // Log the specific error details
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
        const fileName = `${Date.now()}-${file.name}`; // Add timestamp to prevent conflicts
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
      
      // Reload the file list
      console.log('🔄 [DEBUG] Reloading file list...');
      await loadFiles();
      console.log('✅ [DEBUG] File list reloaded');
      
      // Clear the file input
      event.target.value = '';
      console.log('🧹 [DEBUG] File input cleared');
      
    } catch (err) {
      console.error('💥 [DEBUG] Error during cleanup:', err);
      setError('Some files failed to process');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    const fileName = getFileName(filePath);
    
    if (!window.confirm(`Are you sure you want to delete "${fileName}"?\n\nThis will also delete all associated invoice data from the database. This action cannot be undone.`)) {
      return;
    }

    // Add this file to the deleting set
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

      // Step 2: For each job, delete all associated invoices and then the job itself
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

      // Step 4: Reload the file list
      console.log('🔄 [DEBUG] Reloading file list...');
      await loadFiles();
      console.log('✅ [DEBUG] File list reloaded');
      
      console.log('🎉 [DEBUG] File deletion process completed successfully');
      
      // Show success message
      if (associatedJobs.length > 0) {
        const totalInvoices = associatedJobs.reduce((sum, job) => sum + (job.successfulInvoices || 0), 0);
        setError(null);
        // You could add a success state here if you want to show a success message
        console.log(`✅ [DEBUG] Successfully deleted file and ${totalInvoices} associated invoice records`);
      }
      
    } catch (err) {
      console.error('💥 [DEBUG] Error in file deletion process:', err);
      setError(`Failed to delete file and associated data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      // Remove this file from the deleting set
      setDeletingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  const handleClearProcessingHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all processing history? This action cannot be undone.')) {
      return;
    }

    setClearingHistory(true);
    setError(null);

    try {
      console.log('🧹 [DEBUG] Starting to clear processing history...');
      
      // Delete all processing jobs
      const deletePromises = processingJobs.map(async (job) => {
        try {
          console.log(`🗑️ [DEBUG] Deleting job: ${job.fileName} (${job.id})`);
          const result = await client.models.InvoiceUploadJob.delete({ id: job.id });
          
          if (result.errors) {
            console.error(`❌ [DEBUG] Failed to delete job ${job.id}:`, result.errors);
            throw new Error(`Failed to delete job: ${result.errors[0]?.message || 'Unknown error'}`);
          }
          
          console.log(`✅ [DEBUG] Successfully deleted job: ${job.id}`);
          return result;
        } catch (error) {
          console.error(`💥 [DEBUG] Exception deleting job ${job.id}:`, error);
          throw error;
        }
      });

      // Wait for all deletions to complete
      const results = await Promise.allSettled(deletePromises);
      
      // Count successes and failures
      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;
      
      console.log(`🏁 [DEBUG] Processing history cleanup completed: ${successful} deleted, ${failed} failed`);
      
      if (failed > 0) {
        setError(`Warning: ${failed} out of ${processingJobs.length} jobs could not be deleted`);
      }
      
      // The real-time subscription will automatically update the processingJobs state
      console.log('✅ [DEBUG] Processing history cleared successfully');
      
    } catch (error) {
      console.error('💥 [DEBUG] Error clearing processing history:', error);
      setError('Failed to clear processing history. Please try again.');
    } finally {
      setClearingHistory(false);
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
      errors.push(`Row ${rowNumber}: Invalid or missing invoice_id (must be UUID format like: 550e8400-e29b-41d4-a716-446655440001)`);
    } else {
      invoice.invoiceId = row.invoice_id;
    }
    
    // Validate seller_id (UUID)
    if (!row.seller_id || !isValidUUID(row.seller_id)) {
      errors.push(`Row ${rowNumber}: Invalid or missing seller_id (must be UUID format like: 550e8400-e29b-41d4-a716-446655440011)`);
    } else {
      invoice.sellerId = row.seller_id;
    }
    
    // Validate debtor_id (UUID)
    if (!row.debtor_id || !isValidUUID(row.debtor_id)) {
      errors.push(`Row ${rowNumber}: Invalid or missing debtor_id (must be UUID format like: 550e8400-e29b-41d4-a716-446655440021)`);
    } else {
      invoice.debtorId = row.debtor_id;
    }
    
    // Validate currency (using schema enum values)
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];
    if (!row.currency || !validCurrencies.includes(row.currency.toUpperCase())) {
      errors.push(`Row ${rowNumber}: Invalid currency. Must be one of: ${validCurrencies.join(', ')}`);
    } else {
      invoice.currency = row.currency.toUpperCase();
    }
    
    // Validate amount
    const amount = parseFloat(row.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowNumber}: Invalid amount (must be positive number like: 1500.50)`);
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
      errors.push(`Row ${rowNumber}: Invalid issue_date (must be YYYY-MM-DD format like: 2024-01-15)`);
    } else {
      invoice.issueDate = formatDateString(row.issue_date);
    }
    
    // Validate due_date
    if (!row.due_date || !isValidDate(row.due_date)) {
      errors.push(`Row ${rowNumber}: Invalid due_date (must be YYYY-MM-DD format like: 2024-02-15)`);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return '⏳';
      case 'PROCESSING': return '⚙️';
      case 'COMPLETED': return '✅';
      case 'FAILED': return '❌';
      default: return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return '#f59e0b';
      case 'PROCESSING': return '#32b3e7';
      case 'COMPLETED': return '#32b3e7';
      case 'FAILED': return '#ef4444';
      default: return '#5e6e77';
    }
  };

  return (
    <div className="invoice-upload">
      <div className="upload-header">
        <h2>📊 Invoice Processing Center</h2>
        <p>Upload CSV or Excel files containing commercial invoice data for automated processing</p>
      </div>

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
          📤 Upload & Process Invoice Files (CSV/Excel)
        </label>
        <div className="file-requirements">
          <p><strong>Required columns:</strong> invoice_id, seller_id, debtor_id, currency, amount, product, issue_date, due_date</p>
          <p><strong>Data format examples:</strong></p>
          <ul>
            <li><strong>IDs:</strong> UUID format (e.g., 550e8400-e29b-41d4-a716-446655440001)</li>
            <li><strong>Currency:</strong> USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY</li>
            <li><strong>Amount:</strong> Positive decimal (e.g., 1500.50)</li>
            <li><strong>Dates:</strong> YYYY-MM-DD format (e.g., 2024-01-15)</li>
          </ul>
          <p><strong>Supported formats:</strong> CSV, Excel (.xlsx)</p>
        </div>
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

      {processingJobs.length > 0 && (
        <div className="processing-jobs-section">
          <div className="jobs-header">
            <h3>⚙️ Processing History</h3>
            <button 
              onClick={handleClearProcessingHistory} 
              className="clear-history-btn" 
              disabled={clearingHistory}
              title="Clear all processing history"
            >
              {clearingHistory ? '🧹 Clearing...' : '🗑️ Clear History'}
            </button>
          </div>
          <div className="jobs-list">
            {processingJobs.slice(0, 5).map((job) => (
              <div key={job.id} className="job-item">
                <div className="job-info">
                  <div className="job-header">
                    <span className="job-name">📄 {job.fileName}</span>
                    <span 
                      className="job-status"
                      style={{ color: getStatusColor(job.status) }}
                    >
                      {getStatusIcon(job.status)} {job.status}
                    </span>
                  </div>
                  
                  {job.status === 'COMPLETED' && (
                    <div className="job-results">
                      <span className="success-count">✅ {job.successfulInvoices || 0} invoices processed</span>
                      {(job.failedInvoices || 0) > 0 && (
                        <span className="error-count">❌ {job.failedInvoices || 0} failed</span>
                      )}
                    </div>
                  )}
                  
                  {job.status === 'FAILED' && job.errorMessage && (
                    <div className="job-error">
                      ❌ {job.errorMessage}
                    </div>
                  )}
                  
                  <div className="job-timestamp">
                    {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Unknown date'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="files-section">
        <div className="files-header">
          <h3>📁 Uploaded Files</h3>
          <button onClick={loadFiles} className="refresh-btn" disabled={loading}>
            {loading ? '🔄 Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {loading && files.length === 0 ? (
          <div className="loading">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="no-files">
            No files found. Upload invoice files to get started!
          </div>
        ) : (
          <div className="files-list">
            {files.map((file) => (
              <div key={file.path} className="file-item">
                <div className="file-info">
                  <div className="file-name">📄 {getFileName(file.path)}</div>
                  <div className="file-details">
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    {file.lastModified && (
                      <span className="file-date">
                        {file.lastModified.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteFile(file.path)}
                  className="delete-btn"
                  title={deletingFiles.has(file.path) ? "Deleting file and data..." : "Delete file and all associated data"}
                  disabled={deletingFiles.has(file.path)}
                >
                  {deletingFiles.has(file.path) ? '🔄 Deleting...' : '🗑️ Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .invoice-upload {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .upload-header {
          margin-bottom: 30px;
          text-align: center;
          border-bottom: 2px solid #32b3e7;
          padding-bottom: 20px;
        }

        .upload-header h2 {
          margin: 0 0 10px 0;
          color: #002b4b;
          font-size: 28px;
        }

        .upload-header p {
          margin: 0;
          color: #5e6e77;
          font-size: 16px;
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
          padding: 25px;
          border: 2px dashed #32b3e7;
          border-radius: 8px;
          text-align: center;
          background: linear-gradient(135deg, #f8fcff 0%, #e6f7ff 100%);
        }

        .file-input {
          display: none;
        }

        .upload-button {
          display: inline-block;
          padding: 15px 30px;
          background: linear-gradient(135deg, #32b3e7 0%, #1a9bd8 100%);
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          box-shadow: 0 4px 6px rgba(50, 179, 231, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .upload-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 8px rgba(50, 179, 231, 0.4);
        }

        .file-requirements {
          margin-top: 15px;
          font-size: 14px;
          color: #5e6e77;
          background: white;
          padding: 15px;
          border-radius: 6px;
          border: 1px solid #32b3e7;
          text-align: left;
        }

        .file-requirements p {
          margin: 5px 0;
        }

        .file-requirements ul {
          margin: 10px 0 10px 20px;
          padding: 0;
        }

        .file-requirements li {
          margin: 5px 0;
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

        .processing-jobs-section {
          margin-bottom: 30px;
          padding: 20px;
          background: white;
          border-radius: 8px;
          border: 1px solid #32b3e7;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
        }

        .processing-jobs-section h3 {
          margin: 0 0 20px 0;
          color: #002b4b;
        }

        .jobs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .jobs-header h3 {
          margin: 0;
          color: #002b4b;
        }

        .clear-history-btn {
          padding: 8px 16px;
          background: #fed7d7;
          color: #c53030;
          border: 1px solid #feb2b2;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .clear-history-btn:hover:not(:disabled) {
          background: #feb2b2;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .clear-history-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .jobs-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .job-item {
          padding: 15px;
          background: #f8fcff;
          border: 1px solid #32b3e7;
          border-radius: 6px;
          transition: background 0.2s;
        }

        .job-item:hover {
          background: #e6f7ff;
        }

        .job-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .job-name {
          font-weight: 600;
          color: #002b4b;
        }

        .job-status {
          font-weight: 600;
          font-size: 14px;
        }

        .job-results {
          display: flex;
          gap: 15px;
          margin-bottom: 5px;
          font-size: 14px;
        }

        .success-count {
          color: #32b3e7;
          font-weight: 500;
        }

        .error-count {
          color: #ef4444;
          font-weight: 500;
        }

        .job-error {
          color: #ef4444;
          font-size: 14px;
          margin-bottom: 5px;
          font-weight: 500;
        }

        .job-timestamp {
          font-size: 12px;
          color: #5e6e77;
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
        }

        .files-header h3 {
          margin: 0;
          color: #002b4b;
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

        .files-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .file-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background: #f8fcff;
          border: 1px solid #32b3e7;
          border-radius: 6px;
          transition: background 0.2s;
        }

        .file-item:hover {
          background: #e6f7ff;
        }

        .file-info {
          flex: 1;
        }

        .file-name {
          font-weight: 500;
          color: #002b4b;
          margin-bottom: 5px;
        }

        .file-details {
          display: flex;
          gap: 15px;
          font-size: 14px;
          color: #5e6e77;
        }

        .delete-btn {
          padding: 8px 12px;
          background: #fed7d7;
          color: #c53030;
          border: 1px solid #feb2b2;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        .delete-btn:hover:not(:disabled) {
          background: #feb2b2;
        }

        .delete-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          background: #f8fcff;
          color: #5e6e77;
          border-color: #32b3e7;
        }

        @media (max-width: 600px) {
          .invoice-upload {
            padding: 15px;
          }
          
          .upload-header h2 {
            font-size: 24px;
          }
          
          .files-header, .jobs-header {
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
          }
          
          .file-item {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          
          .file-details {
            flex-direction: column;
            gap: 5px;
          }
          
          .job-header {
            flex-direction: column;
            align-items: stretch;
            gap: 5px;
          }
          
          .job-results {
            flex-direction: column;
            gap: 5px;
          }
        }
      `}</style>
    </div>
  );
};