// components/InvoiceViewer.tsx - Updated with SubmitInvoices component - ENHANCED DATA LOADING - TypeScript Fixed
import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/data';
import { uploadData, getUrl } from 'aws-amplify/storage';
import type { Schema } from '../../../amplify/data/resource';
import { SubmitInvoices } from './SubmitInvoices';
//import type { AmplifyConfig, AmplifyStorageConfig } from '../../utils/amplifyConfigSetup';

const client = generateClient<Schema>();

type SortableField = 'issueDate' | 'dueDate' | 'amount' | 'daysToDueDate' | 'maturityDays' | 'invoiceId' | 'sellerId' | 'debtorId' | 'product' | 'currency' | 'format' | 'pdfDocument';

interface StorageConfigItem {
  bucket?: string;
}

// Type for subscription
interface InvoiceSubscription {
  unsubscribe: () => void;
}

// Type for upload result with extended properties
interface UploadResultExtended {
  path: string;
  key?: string;
  bucket?: string;
  url?: string;
}

// Note: Global Window interface declarations are in src/types/global.d.ts

export const InvoiceViewer: React.FC = () => {
  const [invoices, setInvoices] = useState<Schema["Invoice"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableField>('issueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredInvalidRow, setHoveredInvalidRow] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploadingPdfs, setUploadingPdfs] = useState<Set<string>>(new Set());
  const [pdfUploadProgress, setPdfUploadProgress] = useState<Record<string, number>>({});
  const [deletingPdfs, setDeletingPdfs] = useState<Set<string>>(new Set());
  const itemsPerPage = 20;

  // Helper function to get S3 bucket name from Amplify configuration
  const getS3BucketName = (): string => {
    try {
      // Option 1: Get from Amplify configuration outputs (Gen 2)
      if (window.amplifyConfig?.storage?.bucket_name) {
        console.log('✅ [DEBUG] Got bucket name from Amplify outputs:', window.amplifyConfig.storage.bucket_name);
        return window.amplifyConfig.storage.bucket_name;
      }

      // Option 2: Try to extract from Amplify's internal storage configuration
      if (typeof window !== 'undefined') {
        const amplifyConfigStorage = localStorage.getItem('amplify-storage-config');
        if (amplifyConfigStorage) {
          try {
            const storageConfig = JSON.parse(amplifyConfigStorage) as StorageConfigItem;
            if (storageConfig.bucket) {
              console.log('✅ [DEBUG] Got bucket name from storage config:', storageConfig.bucket);
              return storageConfig.bucket;
            }
          } catch (parseError) {
            console.warn('⚠️ [DEBUG] Failed to parse storage config from localStorage');
          }
        }
      }

      // Option 3: Get from cached bucket name (if we've uploaded before)
      const cachedBucketName = sessionStorage.getItem('amplify-bucket-name');
      if (cachedBucketName) {
        console.log('✅ [DEBUG] Got bucket name from cache:', cachedBucketName);
        return cachedBucketName;
      }

      // Option 4: Dynamic extraction from upload results
      console.log('ℹ️ [DEBUG] Bucket name will be extracted from first upload result');
      return 'DYNAMIC_EXTRACTION';
      
    } catch (error) {
      console.error('❌ [DEBUG] Error getting bucket name:', error);
      return 'DYNAMIC_EXTRACTION';
    }
  };

  // Helper function to construct full S3 path
  const constructFullS3Path = (relativePath: string, bucketName?: string): string => {
    // If we have a bucket name from configuration, use it
    if (bucketName && bucketName !== 'DYNAMIC_EXTRACTION') {
      return `${bucketName}/${relativePath}`;
    }

    // Dynamic extraction: try to extract bucket name from a sample upload path
    // Amplify upload paths typically include the bucket name in the result
    // We'll extract it when we get the upload result
    return relativePath; // Will be updated after upload
  };

  // Enhanced manual refresh function with multiple strategies
  const refreshInvoices = async (): Promise<void> => {
    try {
      setLoading(true);
      console.log('🔄 [DEBUG] Manually refreshing invoices with enhanced strategy...');
      
      // Strategy 1: Direct list query
      const result = await client.models.Invoice.list();
      if (result.errors) {
        console.error('❌ [DEBUG] Error fetching invoices via list:', result.errors);
        
        // Strategy 2: Fallback to observeQuery if list fails
        console.log('🔄 [DEBUG] Falling back to observeQuery refresh...');
        setRefreshKey(prev => prev + 1);
        return;
      } else {
        console.log('✅ [DEBUG] Manual refresh successful, found', result.data?.length || 0, 'invoices');
        setInvoices(result.data || []);
        setError(null);
      }
    } catch (err) {
      console.error('💥 [DEBUG] Exception during manual refresh:', err);
      
      // Strategy 3: Force subscription refresh on error
      console.log('🔄 [DEBUG] Forcing subscription refresh due to error...');
      setRefreshKey(prev => prev + 1);
      setError('Failed to refresh invoices');
    } finally {
      setLoading(false);
    }
  };

  // Enhanced load invoices with dual approach: subscription + manual refresh
  useEffect(() => {
    console.log('🔄 [DEBUG] Setting up enhanced invoice loading (refreshKey:', refreshKey, ')');
    
    let subscription: InvoiceSubscription | null = null;
    let isMounted = true;
    
    const setupDataLoading = async (): Promise<void> => {
      try {
        // Strategy 1: Initial manual load to get immediate data
        console.log('📊 [DEBUG] Initial manual load...');
        const initialResult = await client.models.Invoice.list();
        
        if (isMounted && !initialResult.errors && initialResult.data) {
          console.log('✅ [DEBUG] Initial load successful:', initialResult.data.length, 'invoices');
          setInvoices(initialResult.data);
          setLoading(false);
        }
        
        // Strategy 2: Setup real-time subscription for updates
        console.log('📊 [DEBUG] Setting up real-time subscription...');
        subscription = client.models.Invoice.observeQuery().subscribe({
          next: ({ items, isSynced }) => {
            if (isMounted) {
              console.log('📊 [DEBUG] Subscription update:', {
                itemCount: items.length,
                isSynced,
                refreshKey
              });
              setInvoices(items);
              setLoading(false);
            }
          },
          error: (err: Error) => {
            if (isMounted) {
              console.error('❌ [DEBUG] Subscription error:', err);
              setError('Failed to load invoices');
              setLoading(false);
            }
          }
        });
        
      } catch (error) {
        if (isMounted) {
          console.error('💥 [DEBUG] Setup error:', error);
          setError('Failed to initialize invoice loading');
          setLoading(false);
        }
      }
    };
    
    // Delayed setup to allow for data propagation
    const setupTimer = setTimeout(setupDataLoading, 100);

    return () => {
      isMounted = false;
      clearTimeout(setupTimer);
      if (subscription) {
        console.log('🧹 [DEBUG] Cleaning up invoice subscription');
        subscription.unsubscribe();
      }
    };
  }, [refreshKey]); // Add refreshKey as dependency to force re-subscription

  // Expose enhanced refresh function globally for other components to use
  useEffect(() => {
    // Store the refresh function globally so UploadStore can call it
    window.refreshInvoiceViewer = () => {
      console.log('🔄 [DEBUG] External refresh triggered - using multiple strategies');
      
      // Strategy 1: Force subscription refresh
      setRefreshKey(prev => prev + 1);
      
      // Strategy 2: Manual refresh with delay
      setTimeout(refreshInvoices, 200);
      
      // Strategy 3: Additional delayed refresh for timing issues
      setTimeout(refreshInvoices, 1000);
    };

    // Cleanup
    return () => {
      delete window.refreshInvoiceViewer;
    };
  }, []);

  // Calculate analytics for all invoices
  const analytics = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    const invalidInvoices = invoices.filter(inv => !inv.isValid);
    const totalAmount = validInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    console.log('📊 [DEBUG] Analytics calculated:', {
      total: invoices.length,
      valid: validInvoices.length,
      invalid: invalidInvoices.length,
      totalAmount
    });

    return {
      totalInvoices: invoices.length, // Show total count including invalid
      validInvoices: validInvoices.length,
      invalidInvoices: invalidInvoices.length,
      totalAmount
    };
  }, [invoices]);

  // Calculate maturity days: Due Date - Issue Date
  const calculateMaturityDays = (issueDate: string, dueDate: string): number => {
    const issue = new Date(issueDate);
    const due = new Date(dueDate);
    const diffTime = due.getTime() - issue.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Calculate days to due date: Due Date - Today's Date
  const calculateDaysToDueDate = (dueDate: string): number => {
    const today = new Date();
    const due = new Date(dueDate);
    
    // Reset time to midnight for both dates to get accurate day difference
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Sort invoices - Show ALL invoices (valid and invalid)
  const sortedInvoices = useMemo(() => {
    console.log('📊 [DEBUG] Sorting invoices. Total loaded:', invoices.length);
    console.log('📊 [DEBUG] Valid invoices:', invoices.filter(inv => inv.isValid).length);
    console.log('📊 [DEBUG] Invalid invoices:', invoices.filter(inv => !inv.isValid).length);
    
    // Show ALL invoices, not just valid ones
    return invoices.sort((a, b) => {
      let aValue: string | number, bValue: string | number;
      
      switch (sortBy) {
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'dueDate':
          aValue = new Date(a.dueDate).getTime();
          bValue = new Date(b.dueDate).getTime();
          break;
        case 'issueDate':
          aValue = new Date(a.issueDate).getTime();
          bValue = new Date(b.issueDate).getTime();
          break;
        case 'daysToDueDate':
          aValue = calculateDaysToDueDate(a.dueDate);
          bValue = calculateDaysToDueDate(b.dueDate);
          break;
        case 'maturityDays':
          aValue = calculateMaturityDays(a.issueDate, a.dueDate);
          bValue = calculateMaturityDays(b.issueDate, b.dueDate);
          break;
        case 'invoiceId':
          aValue = a.invoiceId.toLowerCase();
          bValue = b.invoiceId.toLowerCase();
          break;
        case 'sellerId':
          aValue = a.sellerId.toLowerCase();
          bValue = b.sellerId.toLowerCase();
          break;
        case 'debtorId':
          aValue = a.debtorId.toLowerCase();
          bValue = b.debtorId.toLowerCase();
          break;
        case 'product':
          aValue = a.product.toLowerCase();
          bValue = b.product.toLowerCase();
          break;
        case 'currency':
          aValue = a.currency;
          bValue = b.currency;
          break;
        case 'format':
          aValue = a.isValid ? 'valid' : 'invalid';
          bValue = b.isValid ? 'valid' : 'invalid';
          break;
        case 'pdfDocument':
          aValue = a.pdfS3Key ? 'has_pdf' : 'no_pdf';
          bValue = b.pdfS3Key ? 'has_pdf' : 'no_pdf';
          break;
        default:
          aValue = new Date(a.issueDate).getTime();
          bValue = new Date(b.issueDate).getTime();
          break;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [invoices, sortBy, sortDirection]);

  // Paginate results
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedInvoices, currentPage]);

  const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage);

  const handleSort = (field: SortableField): void => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const formatCurrency = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const getValidationErrorsTooltip = (errors: (string | null)[] | null | undefined): string => {
    if (!errors) return '';
    return errors.filter((error): error is string => error !== null).join('; ');
  };

  // Helper function to format days with context
  const formatDaysToDueDate = (days: number): string => {
    if (days > 0) {
      return `${days} days`;
    } else if (days === 0) {
      return 'Today';
    } else {
      return `${Math.abs(days)} days overdue`;
    }
  };

  // Helper function to get CSS class for days to due date
  const getDaysToDueDateClass = (days: number): string => {
    if (days < 0) return 'overdue';
    if (days === 0) return 'due-today';
    if (days <= 7) return 'due-soon';
    return 'due-normal';
  };

  // PDF Upload Handler - Updated with enhanced debugging
  const handlePdfUpload = async (invoiceId: string, file: File): Promise<void> => {
    if (!file.type.includes('pdf')) {
      alert('Please select a PDF file');
      return;
    }

    setUploadingPdfs(prev => new Set(prev).add(invoiceId));
    setPdfUploadProgress(prev => ({ ...prev, [invoiceId]: 0 }));

    try {
      console.log('📄 [DEBUG] Starting PDF upload for invoice:', invoiceId);
      console.log('📄 [DEBUG] File details:', { name: file.name, size: file.size, type: file.type });
      
      // Verify the invoice exists before uploading
      console.log('🔍 [DEBUG] Verifying invoice exists in database...');
      const existingInvoice = invoices.find(inv => inv.id === invoiceId);
      if (!existingInvoice) {
        throw new Error(`Invoice with ID ${invoiceId} not found in current invoice list`);
      }
      console.log('✅ [DEBUG] Invoice found:', { id: existingInvoice.id, invoiceId: existingInvoice.invoiceId });
      
      // Generate unique S3 key for the PDF
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const s3Key = `user-files/{identityId}/invoices/${invoiceId}/${timestamp}-${sanitizedFileName}`;
      
      console.log('📄 [DEBUG] Generated S3 key template:', s3Key);
      
      // Upload to S3
      const uploadResult = await uploadData({
        path: ({ identityId }) => {
          const fullPath = s3Key.replace('{identityId}', identityId || '');
          console.log('📄 [DEBUG] Upload path:', fullPath);
          console.log('📄 [DEBUG] Identity ID:', identityId);
          return fullPath;
        },
        data: file,
        options: {
          onProgress: ({ transferredBytes, totalBytes }) => {
            if (totalBytes) {
              const progress = Math.round((transferredBytes / totalBytes) * 100);
              console.log('📄 [DEBUG] Upload progress:', progress + '%');
              setPdfUploadProgress(prev => ({ ...prev, [invoiceId]: progress }));
            }
          },
        },
      }).result;

      console.log('✅ [DEBUG] PDF uploaded successfully to S3');
      console.log('📄 [DEBUG] Upload result:', uploadResult);
      console.log('📄 [DEBUG] Upload result path:', uploadResult.path);
      
      // Get bucket name dynamically
      const configBucketName = getS3BucketName();
      let fullS3Path: string;
      
      if (configBucketName && configBucketName !== 'DYNAMIC_EXTRACTION') {
        // Use bucket name from configuration
        fullS3Path = constructFullS3Path(uploadResult.path, configBucketName);
        console.log('📄 [DEBUG] Full S3 path from config:', fullS3Path);
      } else {
        // Extract bucket name from upload result
        console.log('📄 [DEBUG] Attempting to extract bucket name from upload result...');
        
        // Amplify Gen 2 upload results might contain the full URL
        // Let's try to extract bucket name from various sources
        let extractedBucketName: string | null = null;
        
        // Method 1: Check if upload result has additional metadata
        const uploadResultFull = uploadResult as UploadResultExtended;
        console.log('📄 [DEBUG] Full upload result structure:', JSON.stringify(uploadResultFull, null, 2));
        
        // Method 2: Try to get a signed URL to extract bucket name
        try {
          console.log('📄 [DEBUG] Generating URL for bucket extraction...');
          const testUrl = await getUrl({
            path: uploadResult.path,
            options: { expiresIn: 60 }
          });
          
          const urlString = testUrl.url.toString();
          console.log('📄 [DEBUG] Generated URL for bucket extraction:', urlString);
          
          // Extract bucket name from S3 URL format: https://bucket-name.s3.region.amazonaws.com/...
          const bucketMatch = urlString.match(/https:\/\/([^.]+)\.s3\./);
          if (bucketMatch) {
            extractedBucketName = bucketMatch[1];
            console.log('✅ [DEBUG] Extracted bucket name from URL:', extractedBucketName);
            
            // Cache it for future use
            sessionStorage.setItem('amplify-bucket-name', extractedBucketName);
          } else {
            console.warn('⚠️ [DEBUG] Could not extract bucket name from URL pattern');
          }
        } catch (urlError) {
          console.error('❌ [DEBUG] Could not generate URL for bucket extraction:', urlError);
        }
        
        if (extractedBucketName) {
          fullS3Path = `${extractedBucketName}/${uploadResult.path}`;
          console.log('📄 [DEBUG] Full S3 path extracted dynamically:', fullS3Path);
        } else {
          // Final fallback: use a descriptive placeholder
          fullS3Path = `AMPLIFY_BUCKET_${Date.now()}/${uploadResult.path}`;
          console.warn('⚠️ [DEBUG] Using timestamped placeholder bucket name:', fullS3Path);
        }
      }
      
      console.log('📄 [DEBUG] Final paths:');
      console.log('📄 [DEBUG] - Relative S3 path:', uploadResult.path);
      console.log('📄 [DEBUG] - Full S3 path:', fullS3Path);
      console.log('📄 [DEBUG] - PDF filename:', file.name);

      // Update the Invoice record with PDF info including full path
      console.log('💾 [DEBUG] Starting database update for invoice:', invoiceId);
      console.log('💾 [DEBUG] Update payload:', {
        id: invoiceId,
        pdfS3Key: uploadResult.path,
        pdfS3FullPath: fullS3Path,
        pdfFileName: file.name,
        pdfUploadedAt: new Date().toISOString()
      });
      
      const updateResult = await client.models.Invoice.update({
        id: invoiceId,
        pdfS3Key: uploadResult.path, // Relative path for app functionality
        pdfS3FullPath: fullS3Path, // Full path including bucket name (stored but not displayed)
        pdfFileName: file.name,
        pdfUploadedAt: new Date().toISOString(),
      });

      console.log('💾 [DEBUG] Database update result:', updateResult);

      if (updateResult.errors) {
        console.error('❌ [DEBUG] Failed to update invoice with PDF info:');
        updateResult.errors.forEach((error, index) => {
          console.error(`❌ [DEBUG] Error ${index + 1}:`, {
            message: error.message,
            path: error.path,
            errorType: error.errorType,
            extensions: error.extensions
          });
        });
        throw new Error(`Failed to save PDF information: ${updateResult.errors[0]?.message || 'Unknown error'}`);
      }

      if (!updateResult.data) {
        console.error('❌ [DEBUG] Update succeeded but no data returned');
        throw new Error('Database update returned no data');
      }

      console.log('✅ [DEBUG] Invoice updated with PDF info successfully');
      console.log('💾 [DEBUG] Updated invoice data:', updateResult.data);
      console.log('📄 [DEBUG] Stored paths - Relative:', uploadResult.path, 'Full:', fullS3Path);
      
      // Refresh the invoice list to show the updated data
      console.log('🔄 [DEBUG] Refreshing invoice list...');
      await refreshInvoices();
      console.log('✅ [DEBUG] Invoice list refreshed');
      
    } catch (error) {
      console.error('💥 [DEBUG] PDF upload failed with error:', error);
      console.error('💥 [DEBUG] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      alert(`Failed to upload PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploadingPdfs(prev => {
        const newSet = new Set(prev);
        newSet.delete(invoiceId);
        return newSet;
      });
      setPdfUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[invoiceId];
        return newProgress;
      });
    }
  };

  // PDF Download Handler
  const handlePdfDownload = async (invoice: Schema["Invoice"]["type"]): Promise<void> => {
    if (!invoice.pdfS3Key) return;

    try {
      console.log('📄 [DEBUG] Getting download URL for PDF:', invoice.pdfS3Key);
      console.log('📄 [DEBUG] Full S3 path (not used for download):', invoice.pdfS3FullPath);
      
      const downloadUrl = await getUrl({
        path: invoice.pdfS3Key, // Use relative path for download
        options: {
          expiresIn: 3600, // URL expires in 1 hour
        },
      });

      // Open PDF in new tab
      window.open(downloadUrl.url.toString(), '_blank');
      
    } catch (error) {
      console.error('💥 [DEBUG] Failed to download PDF:', error);
      alert(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // PDF Delete Handler - Updated to clear both path fields
  const handlePdfDelete = async (invoice: Schema["Invoice"]["type"]): Promise<void> => {
    if (!invoice.pdfS3Key || !invoice.id) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the PDF "${invoice.pdfFileName || 'document'}"?\n\nThis action cannot be undone.`
    );

    if (!confirmDelete) return;

    setDeletingPdfs(prev => new Set(prev).add(invoice.id));

    try {
      console.log('🗑️ [DEBUG] Starting PDF deletion for invoice:', invoice.id);
      console.log('🗑️ [DEBUG] Removing paths - Relative:', invoice.pdfS3Key, 'Full:', invoice.pdfS3FullPath);
      
      // Update the Invoice record to remove PDF info (both paths)
      const updateResult = await client.models.Invoice.update({
        id: invoice.id,
        pdfS3Key: null,
        pdfS3FullPath: null, // Clear the full path as well
        pdfFileName: null,
        pdfUploadedAt: null,
      });

      if (updateResult.errors) {
        console.error('❌ [DEBUG] Failed to update invoice (remove PDF info):', updateResult.errors);
        throw new Error('Failed to remove PDF information from database');
      }

      console.log('✅ [DEBUG] PDF information removed from invoice record successfully');
      
      // Note: We don't delete from S3 immediately for data safety
      // The file will remain in S3 but won't be accessible through the app
      // This allows for potential recovery if needed
      
      // Refresh the invoice list
      refreshInvoices();
      
    } catch (error) {
      console.error('💥 [DEBUG] PDF deletion failed:', error);
      alert(`Failed to delete PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingPdfs(prev => {
        const newSet = new Set(prev);
        newSet.delete(invoice.id);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="invoice-viewer loading">
        <div className="loading-content">
          <div className="spinner">🔄</div>
          <p>Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-viewer">
      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* ADD THIS: Submit Invoices Component */}
      <SubmitInvoices 
        invoices={invoices}
        loading={loading}
        onRefreshInvoices={refreshInvoices}
      />

      {/* Analytics Cards - Show both valid and invalid counts */}
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="card-content">
            <div className="card-number">{analytics.totalInvoices.toLocaleString()}</div>
            <div className="card-label">Total Invoices</div>
            {analytics.invalidInvoices > 0 && (
              <div className="card-breakdown">
                ✅ {analytics.validInvoices} Valid • ❌ {analytics.invalidInvoices} Invalid
              </div>
            )}
          </div>
        </div>
        
        <div className="analytics-card">
          <div className="card-content">
            <div className="card-number">${analytics.totalAmount.toLocaleString()}</div>
            <div className="card-label">Total Value (Valid Invoices Only)</div>
          </div>
        </div>
      </div>

      {/* Results Summary with Refresh Button */}
      <div className="results-summary">
        <div className="summary-content">
          <p>
            Showing {paginatedInvoices.length} of {sortedInvoices.length} invoices (including valid and invalid records)
          </p>
          <button 
            onClick={refreshInvoices}
            className="refresh-btn"
            disabled={loading}
            title="Refresh invoice data"
          >
            {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Invoice Table with Horizontal Scrolling */}
      <div className="invoice-table-container">
        <table className="invoice-table">
          <thead>
            <tr>
              <th 
                className={`sortable ${sortBy === 'format' ? 'active' : ''}`}
                onClick={() => handleSort('format')}
              >
                Format {sortBy === 'format' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'pdfDocument' ? 'active' : ''}`}
                onClick={() => handleSort('pdfDocument')}
              >
                PDF Document {sortBy === 'pdfDocument' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'issueDate' ? 'active' : ''}`}
                onClick={() => handleSort('issueDate')}
              >
                Issue Date {sortBy === 'issueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'dueDate' ? 'active' : ''}`}
                onClick={() => handleSort('dueDate')}
              >
                Due Date {sortBy === 'dueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'maturityDays' ? 'active' : ''}`}
                onClick={() => handleSort('maturityDays')}
                title="Payment terms: Number of days between Issue Date and Due Date"
              >
                Maturity Days {sortBy === 'maturityDays' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'daysToDueDate' ? 'active' : ''}`}
                onClick={() => handleSort('daysToDueDate')}
                title="Payment status: Days remaining until due date (negative = overdue)"
              >
                Days To Due Date {sortBy === 'daysToDueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'invoiceId' ? 'active' : ''}`}
                onClick={() => handleSort('invoiceId')}
              >
                Invoice ID {sortBy === 'invoiceId' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'sellerId' ? 'active' : ''}`}
                onClick={() => handleSort('sellerId')}
              >
                Seller ID {sortBy === 'sellerId' && (sortDirection === 'asc' ? '↓' : '↑')}
              </th>
              <th 
                className={`sortable ${sortBy === 'debtorId' ? 'active' : ''}`}
                onClick={() => handleSort('debtorId')}
              >
                Debtor ID {sortBy === 'debtorId' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'product' ? 'active' : ''}`}
                onClick={() => handleSort('product')}
              >
                Product {sortBy === 'product' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'currency' ? 'active' : ''}`}
                onClick={() => handleSort('currency')}
              >
                Currency {sortBy === 'currency' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'amount' ? 'active' : ''}`}
                onClick={() => handleSort('amount')}
              >
                Amount {sortBy === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedInvoices.map((invoice) => (
              <tr 
                key={invoice.id}
                className={`${!invoice.isValid ? 'invalid-row' : ''}`}
              >
                <td className="format-cell">
                  {invoice.isValid ? (
                    <span className="format-badge valid">✅ Valid</span>
                  ) : (
                    <span 
                      className="format-badge invalid"
                      onMouseEnter={() => setHoveredInvalidRow(invoice.id)}
                      onMouseLeave={() => setHoveredInvalidRow(null)}
                      title={getValidationErrorsTooltip(invoice.validationErrors)}
                    >
                      ❌ Invalid
                    </span>
                  )}
                  
                  {/* Tooltip for invalid records */}
                  {!invoice.isValid && hoveredInvalidRow === invoice.id && (
                    <div className="validation-tooltip">
                      <strong>Validation Errors:</strong>
                      <ul>
                        {(invoice.validationErrors || [])
                          .filter((error): error is string => error !== null)
                          .map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                </td>
                <td className="pdf-cell">
                  {!invoice.isValid ? (
                    // Disable PDF upload for invalid invoices
                    <div className="pdf-disabled">
                      <span className="pdf-disabled-text">PDF upload disabled</span>
                      <span className="pdf-disabled-reason">(Fix validation errors first)</span>
                    </div>
                  ) : invoice.pdfS3Key ? (
                    // Show download and delete buttons if PDF exists
                    <div className="pdf-actions">
                      <div className="pdf-buttons">
                        <button
                          onClick={() => handlePdfDownload(invoice)}
                          className="pdf-download-btn"
                          title={`Download: ${invoice.pdfFileName || 'invoice.pdf'}`}
                          disabled={deletingPdfs.has(invoice.id)}
                        >
                          ⤵ Download
                        </button>
                        <button
                          onClick={() => handlePdfDelete(invoice)}
                          className="pdf-delete-btn"
                          title={`Delete: ${invoice.pdfFileName || 'invoice.pdf'}`}
                          disabled={deletingPdfs.has(invoice.id)}
                        >
                          <span className={deletingPdfs.has(invoice.id) ? 'unicode-spinner' : ''}>
                            {deletingPdfs.has(invoice.id) ? '🔄' : '🗑️'}
                          </span>
                        </button>
                      </div>
                      <div className="pdf-info">
                        {invoice.pdfFileName && (
                          <span className="pdf-filename">{invoice.pdfFileName}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Show upload button if no PDF
                    <div className="pdf-upload">
                      {uploadingPdfs.has(invoice.id) ? (
                        <div className="pdf-uploading">
                          <div className="upload-spinner">↻</div>
                          <div className="upload-progress">
                            {pdfUploadProgress[invoice.id] || 0}%
                          </div>
                        </div>
                      ) : (
                        <>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handlePdfUpload(invoice.id, file);
                              }
                              e.target.value = ''; // Reset input
                            }}
                            className="pdf-file-input"
                            id={`pdf-upload-${invoice.id}`}
                          />
                          <label
                            htmlFor={`pdf-upload-${invoice.id}`}
                            className="pdf-upload-btn"
                            title="Upload PDF document for this invoice"
                          >
                            ⤴ Upload PDF
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td>{formatDate(invoice.issueDate)}</td>
                <td>{formatDate(invoice.dueDate)}</td>
                <td className="maturity-days-cell">
                  {calculateMaturityDays(invoice.issueDate, invoice.dueDate)}
                </td>
                <td className={`days-to-due-cell ${getDaysToDueDateClass(calculateDaysToDueDate(invoice.dueDate))}`}>
                  {formatDaysToDueDate(calculateDaysToDueDate(invoice.dueDate))}
                </td>
                <td className="invoice-id">{invoice.invoiceId}</td>
                <td className="seller-id">{invoice.sellerId}</td>
                <td className="debtor-id">{invoice.debtorId}</td>
                <td className="product-cell">{invoice.product}</td>
                <td className="currency-cell">{invoice.currency}</td>
                <td className="amount-cell">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="pagination-btn"
          >
            ← Previous
          </button>
          
          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>
          
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      )}

      <style>{`
        .invoice-viewer {
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .loading {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
        }

        .loading-content {
          text-align: center;
          color: #5e6e77;
        }

        .spinner {
          font-size: 24px;
          margin-bottom: 10px;
        }

        .error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #feb2b2;
        }

        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .analytics-card {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 25px;
          display: flex;
          align-items: center;
          gap: 20px;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .analytics-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(50, 179, 231, 0.2);
        }

        .card-icon {
          font-size: 32px;
        }

        .card-content {
          flex: 1;
        }

        .card-number {
          font-size: 28px;
          font-weight: 700;
          color: #002b4b;
          margin-bottom: 5px;
        }

        .card-label {
          font-size: 16px;
          color: #5e6e77;
          font-weight: 500;
        }

        .card-breakdown {
          font-size: 12px;
          color: #5e6e77;
          margin-top: 4px;
          font-weight: 500;
        }

        .card-breakdown .valid-symbol {
          color: #059669;
        }

        .card-breakdown .invalid-symbol {
          color: #dc2626;
        }

        .results-summary {
          margin-bottom: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .summary-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        
        .summary-content p {
          margin: 0;
          color: #5e6e77;
          font-size: 14px;
        }
        
        .refresh-btn {
          padding: 6px 12px;
          background: #f8fcff;
          border: 1px solid #32b3e7;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          color: #5e6e77;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .refresh-btn:hover:not(:disabled) {
          background: #e6f7ff;
          color: #002b4b;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .invoice-table-container {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          overflow-x: auto;
          overflow-y: visible;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
          margin-bottom: 20px;
          max-height: none;
          height: auto;
        }

        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1600px; /* Increased from 1400px for new column */
          table-layout: auto;
        }

        .invoice-table th {
          background: #f8fcff;
          border-bottom: 1px solid #32b3e7;
          padding: 15px 12px;
          text-align: left;
          font-weight: 600;
          color: #002b4b;
          white-space: nowrap;
          position: relative;
          top: auto;
        }

        .invoice-table th.sortable {
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }

        .invoice-table th.sortable:hover {
          background: #e6f7ff;
        }

        .invoice-table th.active {
          background: #32b3e7;
          color: white;
        }

        .invoice-table td {
          padding: 15px 12px;
          border-bottom: 1px solid #e6f7ff;
          white-space: nowrap;
          vertical-align: top;
        }

        .invoice-table tbody {
          background: white;
        }

        .invoice-table tbody tr {
          background: white;
          display: table-row;
          visibility: visible;
        }

        .invoice-table tr:hover {
          background: #f8fcff !important;
        }

        .invoice-table tr.invalid-row {
          background: #fef2f2;
          opacity: 0.9;
        }

        .invoice-table tr.invalid-row:hover {
          background: #fde8e8 !important;
        }

        .invoice-id {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #5e6e77;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .seller-id, .debtor-id {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #5e6e77;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .product-cell {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .currency-cell {
          font-weight: 600;
          color: #002b4b;
          text-align: center;
        }

        .amount-cell {
          font-weight: 600;
          text-align: right;
          color: #32b3e7;
        }

        .maturity-days-cell {
          text-align: center;
          font-weight: 500;
          color: #5e6e77;
          min-width: 80px;
        }

        .days-to-due-cell {
          text-align: center;
          font-weight: 500;
          min-width: 120px;
        }

        .days-to-due-cell.due-normal {
          color: #5e6e77;
        }

        .days-to-due-cell.due-soon {
          color: #d97706;
          font-weight: 600;
        }

        .days-to-due-cell.due-today {
          color: #dc2626;
          font-weight: 700;
          background: #fef2f2;
        }

        .days-to-due-cell.overdue {
          color: #dc2626;
          font-weight: 700;
          background: #fef2f2;
        }

        .format-cell {
          text-align: center;
          position: relative;
          min-width: 90px;
        }

        .format-badge {
          padding: 6px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          cursor: default;
        }

        .format-badge.valid {
          background: #d1fae5;
          color: #065f46;
        }

        .format-badge.valid::before {
          content: '';
          margin-right: 2px;
        }

        .format-badge.invalid {
          background: #fee2e2;
          color: #dc2626;
          cursor: help;
          position: relative;
        }

        .validation-tooltip {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: #1f2937;
          color: white;
          padding: 12px;
          border-radius: 6px;
          font-size: 12px;
          white-space: normal;
          width: 300px;
          z-index: 1000;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          margin-top: 5px;
        }

        .validation-tooltip::before {
          content: '';
          position: absolute;
          top: -5px;
          left: 50%;
          transform: translateX(-50%);
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-bottom: 5px solid #1f2937;
        }

        .validation-tooltip strong {
          display: block;
          margin-bottom: 6px;
          color: #f3f4f6;
        }

        .validation-tooltip ul {
          margin: 0;
          padding-left: 16px;
          list-style-type: disc;
        }

        .validation-tooltip li {
          margin-bottom: 4px;
          line-height: 1.4;
        }

        /* PDF Document Column Styles */
        .pdf-cell {
          text-align: center;
          padding: 10px 8px;
          min-width: 160px;
          max-width: 180px;
        }

        .pdf-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .pdf-buttons {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .pdf-download-btn, 
        .pdf-delete-btn {
          padding: 4px 8px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 2px;
          min-width: 70px;
          justify-content: center;
          position: relative;
        }

        .pdf-download-btn {
          background: #32b3e7;
          color: white;
        }

        .pdf-download-btn:hover:not(:disabled) {
          background: #1a9bd8;
        }

        .pdf-delete-btn {
          background: #fed7d7;
          color: #c53030;
          border: 1px solid #feb2b2;
        }

        .pdf-delete-btn:hover:not(:disabled) {
          background: #feb2b2;
          color: #c53030;
        }

        .pdf-download-btn:disabled, 
        .pdf-delete-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pdf-info {
          width: 100%;
        }

        .pdf-filename {
          font-size: 9px;
          color: #5e6e77;
          word-break: break-all;
          line-height: 1.2;
          max-width: 160px;
          display: block;
        }

        .pdf-upload {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .pdf-file-input {
          display: none;
        }

        .pdf-upload-btn {
          padding: 6px 12px;
          background: #f8fcff;
          color: #32b3e7;
          border: 1px solid #32b3e7;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .pdf-upload-btn:hover {
          background: #32b3e7;
          color: white;
        }

        .pdf-uploading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .upload-spinner {
          font-size: 16px;
          animation: spin 1.5s linear infinite;
        }

        .upload-progress {
          font-size: 11px;
          color: #32b3e7;
          font-weight: 600;
        }

        .unicode-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .pdf-disabled {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          opacity: 0.6;
        }

        .pdf-disabled-text {
          font-size: 11px;
          color: #9ca3af;
          font-weight: 500;
        }

        .pdf-disabled-reason {
          font-size: 9px;
          color: #ef4444;
          font-style: italic;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          padding: 20px;
        }

        .pagination-btn {
          padding: 10px 18px;
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #5e6e77;
          transition: background 0.2s;
        }

        .pagination-btn:hover:not(:disabled) {
          background: #f8fcff;
          color: #002b4b;
        }

        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-info {
          color: #5e6e77;
          font-size: 14px;
          font-weight: 500;
        }

        @media (max-width: 768px) {
          .invoice-viewer {
            padding: 15px;
          }

          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .invoice-table-container {
            font-size: 14px;
            border-radius: 6px;
          }

          .invoice-table th,
          .invoice-table td {
            padding: 10px 8px;
          }

          .product-cell,
          .invoice-id,
          .seller-id,
          .debtor-id,
          .pdf-cell {
            max-width: 100px;
          }

          .pdf-cell {
            max-width: 120px;
            min-width: 120px;
          }

          .pdf-filename {
            font-size: 8px;
            max-width: 100px;
          }

          .pdf-upload-btn,
          .pdf-download-btn,
          .pdf-delete-btn {
            padding: 4px 8px;
            font-size: 10px;
            min-width: 50px;
          }

          .pdf-buttons {
            gap: 3px;
          }

          .validation-tooltip {
            width: 250px;
          }

          .maturity-days-cell,
          .days-to-due-cell {
            min-width: 60px;
          }
        }

        @media (max-width: 480px) {
          .validation-tooltip {
            width: 200px;
            font-size: 11px;
          }

          .maturity-days-cell,
          .days-to-due-cell {
            min-width: 50px;
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
};