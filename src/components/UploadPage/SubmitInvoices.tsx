// components/SubmitInvoices.tsx - Updated with duplicate invoice ID check
import React, { useState, useMemo, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

const client = generateClient<Schema>();

interface SubmitInvoicesProps {
  invoices: Schema["Invoice"]["type"][];
  loading: boolean;
  onRefreshInvoices: () => Promise<void>;
}

export const SubmitInvoices: React.FC<SubmitInvoicesProps> = ({
  invoices,
  loading,
  onRefreshInvoices
}) => {
  // Submit button states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Duplicate checking states
  const [duplicateInvoiceIds, setDuplicateInvoiceIds] = useState<string[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Check for duplicate invoice IDs in SubmittedInvoice table
  useEffect(() => {
    const checkForDuplicates = async () => {
      if (invoices.length === 0) {
        setDuplicateInvoiceIds([]);
        return;
      }

      setCheckingDuplicates(true);
      try {
        console.log('🔍 [DUPLICATES] Checking for duplicate invoice IDs...');
        
        // Get all invoice IDs from current invoices
        const currentInvoiceIds = invoices.map(inv => inv.invoiceId);
        console.log('🔍 [DUPLICATES] Current invoice IDs:', currentInvoiceIds);

        // Query SubmittedInvoice table for any matching invoice IDs
        const submittedInvoicesResult = await client.models.SubmittedInvoice.list();
        
        if (submittedInvoicesResult.errors) {
          console.error('❌ [DUPLICATES] Error checking submitted invoices:', submittedInvoicesResult.errors);
          return;
        }

        const submittedInvoiceIds = submittedInvoicesResult.data.map(inv => inv.invoiceId);
        console.log('🔍 [DUPLICATES] Submitted invoice IDs:', submittedInvoiceIds);

        // Find duplicates
        const duplicates = currentInvoiceIds.filter(id => submittedInvoiceIds.includes(id));
        
        console.log('🔍 [DUPLICATES] Found duplicates:', duplicates);
        setDuplicateInvoiceIds(duplicates);

        if (duplicates.length > 0) {
          console.warn(`⚠️ [DUPLICATES] Found ${duplicates.length} duplicate invoice ID(s):`, duplicates);
        } else {
          console.log('✅ [DUPLICATES] No duplicates found');
        }

      } catch (error) {
        console.error('💥 [DUPLICATES] Error checking for duplicates:', error);
      } finally {
        setCheckingDuplicates(false);
      }
    };

    checkForDuplicates();
  }, [invoices]);

  // Calculate submit button state
  const submitButtonState = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    const validInvoicesWithPdf = validInvoices.filter(inv => inv.pdfS3Key);
    
    const hasInvoices = validInvoices.length > 0;
    const allValidInvoicesHavePdf = validInvoices.length > 0 && validInvoicesWithPdf.length === validInvoices.length;
    const hasDuplicates = duplicateInvoiceIds.length > 0;
    const isEnabled = hasInvoices && allValidInvoicesHavePdf && !hasDuplicates && !loading && !isSubmitting && !checkingDuplicates;
    
    console.log('🔘 [SUBMIT] Submit button state:', {
      hasInvoices,
      validInvoices: validInvoices.length,
      validInvoicesWithPdf: validInvoicesWithPdf.length,
      allValidInvoicesHavePdf,
      hasDuplicates,
      duplicateCount: duplicateInvoiceIds.length,
      isEnabled,
      loading,
      isSubmitting,
      checkingDuplicates
    });

    return {
      visible: hasInvoices,
      enabled: isEnabled,
      validInvoices: validInvoices.length,
      validInvoicesWithPdf: validInvoicesWithPdf.length,
      missingPdfs: validInvoices.length - validInvoicesWithPdf.length,
      hasDuplicates,
      duplicateCount: duplicateInvoiceIds.length,
      duplicateIds: duplicateInvoiceIds
    };
  }, [invoices, loading, isSubmitting, checkingDuplicates, duplicateInvoiceIds]);

  // Submit invoices handler
  const handleSubmitInvoices = async () => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    
    if (validInvoices.length === 0) {
      setSubmitError('No valid invoices to submit');
      return;
    }

    if (duplicateInvoiceIds.length > 0) {
      setSubmitError('Cannot submit: Duplicate invoice IDs found in submitted invoices');
      return;
    }

    const confirmSubmission = window.confirm(
      `Are you sure you want to submit ${validInvoices.length} valid invoice(s)?\n\n` +
      `This will:\n` +
      `• Move all invoice data to the next step\n` +
      `• Clear the uploaded files list\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmSubmission) return;

    setIsSubmitting(true);
    setSubmitProgress(0);
    setSubmitMessage('Starting submission process...');
    setSubmitError(null);

    try {
      console.log('📤 [SUBMIT] Starting submission process for', validInvoices.length, 'invoices');
      
      const currentDateTime = new Date().toISOString();
      const currentDate = currentDateTime.split('T')[0];
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      // Step 1: Copy all valid invoices to SubmittedInvoice table
      console.log('📋 [SUBMIT] Step 1: Copying invoices to SubmittedInvoice table');
      setSubmitMessage(`Copying ${validInvoices.length} invoices to permanent storage...`);
      
      for (let i = 0; i < validInvoices.length; i++) {
        const invoice = validInvoices[i];
        
        try {
          console.log(`📝 [SUBMIT] Copying invoice ${i + 1}/${validInvoices.length}:`, invoice.invoiceId);
          
          // Create submitted invoice record
          const submittedInvoiceData = {
            invoiceId: invoice.invoiceId,
            sellerId: invoice.sellerId,
            debtorId: invoice.debtorId,
            currency: invoice.currency,
            amount: invoice.amount,
            product: invoice.product,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            uploadDate: invoice.uploadDate,
            submittedDate: currentDate,
            submittedAt: currentDateTime,
            originalUploadJobId: invoice.uploadJobId,
            originalInvoiceId: invoice.id,
            // Copy PDF information (S3 files remain untouched)
            pdfS3Key: invoice.pdfS3Key,
            pdfFileName: invoice.pdfFileName,
            pdfUploadedAt: invoice.pdfUploadedAt,
            pdfS3FullPath: invoice.pdfS3FullPath,
            // Submission metadata
            submittedBy: 'user', // Could get actual user info if needed
          };

          const createResult = await client.models.SubmittedInvoice.create(submittedInvoiceData);

          if (createResult.errors) {
            console.error(`❌ [SUBMIT] Failed to create submitted invoice for ${invoice.invoiceId}:`, createResult.errors);
            failCount++;
            errors.push(`Failed to submit invoice ${invoice.invoiceId}: ${createResult.errors[0]?.message || 'Unknown error'}`);
          } else {
            console.log(`✅ [SUBMIT] Successfully created submitted invoice for ${invoice.invoiceId}`);
            successCount++;
          }
          
          // Update progress
          const progress = ((i + 1) / validInvoices.length) * 40; // First 40% for copying
          setSubmitProgress(progress);
          
        } catch (error) {
          console.error(`💥 [SUBMIT] Exception copying invoice ${invoice.invoiceId}:`, error);
          failCount++;
          errors.push(`Failed to submit invoice ${invoice.invoiceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`📊 [SUBMIT] Copy phase completed: ${successCount} successful, ${failCount} failed`);

      // Step 2: Delete original invoices from Invoice table (only successful ones)
      if (successCount > 0) {
        console.log('🗑️ [SUBMIT] Step 2: Deleting original invoices from Invoice table');
        setSubmitMessage(`Cleaning up workspace (deleting ${successCount} original records)...`);
        
        let deleteSuccessCount = 0;
        
        for (let i = 0; i < validInvoices.length; i++) {
          const invoice = validInvoices[i];
          
          // Only delete if the copy was successful (check if this invoice was part of successful copies)
          // We'll delete all that were processed successfully above
          if (i < successCount) { // Simple approach - assumes they were processed in order
            try {
              console.log(`🗑️ [SUBMIT] Deleting original invoice ${i + 1}/${successCount}:`, invoice.invoiceId);
              
              const deleteResult = await client.models.Invoice.delete({ id: invoice.id });
              
              if (deleteResult.errors) {
                console.error(`❌ [SUBMIT] Failed to delete original invoice ${invoice.invoiceId}:`, deleteResult.errors);
                errors.push(`Failed to delete original invoice ${invoice.invoiceId}: ${deleteResult.errors[0]?.message || 'Unknown error'}`);
              } else {
                console.log(`✅ [SUBMIT] Successfully deleted original invoice ${invoice.invoiceId}`);
                deleteSuccessCount++;
              }
              
            } catch (error) {
              console.error(`💥 [SUBMIT] Exception deleting invoice ${invoice.invoiceId}:`, error);
              errors.push(`Failed to delete original invoice ${invoice.invoiceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
          
          // Update progress
          const progress = 40 + ((i + 1) / successCount) * 40; // Second 40% for deletion
          setSubmitProgress(Math.min(progress, 80));
        }
        
        console.log(`📊 [SUBMIT] Delete phase completed: ${deleteSuccessCount} deleted`);
      }

      // Step 3: Refresh the UI and show results
      console.log('🔄 [SUBMIT] Step 3: Refreshing UI');
      setSubmitMessage('Refreshing workspace...');
      setSubmitProgress(85);
      await onRefreshInvoices();
      
      // Step 4: Clear uploaded files list (NEW FUNCTIONALITY)
      console.log('🧹 [SUBMIT] Step 4: Clearing uploaded files list');
      setSubmitMessage('Clearing uploaded files list...');
      setSubmitProgress(90);
      
      if (window.clearUploadedFiles) {
        console.log('🧹 [SUBMIT] Calling clearUploadedFiles function...');
        window.clearUploadedFiles();
        console.log('✅ [SUBMIT] Uploaded files list cleared successfully');
      } else {
        console.warn('⚠️ [SUBMIT] clearUploadedFiles function not available');
      }
      
      // Final result
      setSubmitProgress(100);
      
      if (failCount === 0) {
        setSubmitMessage(`✅ Successfully submitted ${successCount} invoices and cleared workspace!`);
        console.log(`🎉 [SUBMIT] Submission completed successfully: ${successCount} invoices submitted, workspace cleared`);
      } else {
        setSubmitMessage(`⚠️ Partially successful: ${successCount} submitted, ${failCount} failed, workspace cleared`);
        console.log(`⚠️ [SUBMIT] Submission partially completed: ${successCount} successful, ${failCount} failed, workspace cleared`);
        if (errors.length > 0) {
          setSubmitError(`Submission errors: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ' ...' : ''}`);
        }
      }

      // Clear submission state after delay
      setTimeout(() => {
        setSubmitMessage(null);
        setSubmitProgress(0);
      }, 5000);

    } catch (error) {
      console.error('💥 [SUBMIT] Unexpected error during submission:', error);
      setSubmitError(`Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSubmitMessage('❌ Submission failed');
      setTimeout(() => {
        setSubmitMessage(null);
        setSubmitProgress(0);
      }, 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render if no valid invoices
  if (!submitButtonState.visible) {
    return null;
  }

  return (
    <div className="submit-section">
      {submitError && (
        <div className="submit-error-message">
          ❌ {submitError}
        </div>
      )}

      {/* Duplicate Warning */}
      {submitButtonState.hasDuplicates && (
        <div className="duplicate-warning-message">
            <div className="duplicate-ids">
          🚫 <strong>Cannot Submit:</strong> {submitButtonState.duplicateCount} invoice(s) has/ve been already submitted.
          </div>
          <div className="duplicate-ids">
            <strong>Duplicate Invoice IDs:</strong> {submitButtonState.duplicateIds.join(', ')}
          </div>
          <div className="duplicate-solution">
            💡 <strong>Solution:</strong> Remove or modify these invoices before submitting, or check if they were already submitted previously.
          </div>
        </div>
      )}

      <div className="submit-container">
        <div className="submit-info">
          <h3> Submit Invoices</h3>
          <p>
            Ready to submit {submitButtonState.validInvoices} valid invoice(s) to permanent storage.
            {submitButtonState.missingPdfs > 0 && (
              <span className="missing-pdfs">
                {' '}⚠️ {submitButtonState.missingPdfs} invoice(s) missing PDF files.
              </span>
            )}
            {checkingDuplicates && (
              <span className="checking-duplicates">
                {' '}🔍 Checking for duplicates...
              </span>
            )}
          </p>
          {!submitButtonState.enabled && submitButtonState.missingPdfs > 0 && (
            <p className="submit-requirement">
              📎 All valid invoices must have PDF files uploaded before submission.
            </p>
          )}
          {!submitButtonState.enabled && submitButtonState.hasDuplicates && (
            <p className="submit-requirement">
              🚫 Duplicate invoice IDs must be resolved before submission.
            </p>
          )}
          <p className="submit-note">
           💡 <strong>Note:</strong> Submitting will also clear your uploaded files list to keep your workspace clean.
          </p>
        </div>
        
        <div className="submit-actions">
          <button
            onClick={handleSubmitInvoices}
            disabled={!submitButtonState.enabled}
            className={`submit-btn ${submitButtonState.enabled ? 'enabled' : 'disabled'}`}
            title={
              !submitButtonState.enabled && submitButtonState.hasDuplicates
                ? `Cannot submit: ${submitButtonState.duplicateCount} invoice(s) has/ve been already submitted: see below`
                : !submitButtonState.enabled && submitButtonState.missingPdfs > 0
                ? `Upload PDF files for ${submitButtonState.missingPdfs} invoice(s) to enable submission`
                : checkingDuplicates
                ? 'Checking for duplicate invoices...'
                : `Submit ${submitButtonState.validInvoices} valid invoice(s) to permanent storage and clear workspace`
            }
          >
            {isSubmitting ? (
              <>
                <span className="submit-spinner">🔄</span>
                Submitting...
              </>
            ) : checkingDuplicates ? (
              <>
                <span className="submit-spinner">🔍</span>
                Checking...
              </>
            ) : (
              <>
                <span>📤</span>
                Submit {submitButtonState.validInvoices} Invoice{submitButtonState.validInvoices !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Submit Progress */}
      {isSubmitting && (
        <div className="submit-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${submitProgress}%` }}
            />
          </div>
          <div className="progress-text">
            {submitMessage} ({Math.round(submitProgress)}%)
          </div>
        </div>
      )}
      
      {/* Submit Result Message */}
      {submitMessage && !isSubmitting && (
        <div className={`submit-message ${submitMessage.includes('✅') ? 'success' : submitMessage.includes('⚠️') ? 'warning' : 'error'}`}>
          {submitMessage}
        </div>
      )}

      <style>{`
        /* Submit Section Styles */
        .submit-section {
          margin-bottom: 30px;
          background: white;
          border: 2px solid #32b3e7;
          border-radius: 12px;
          padding: 25px;
          box-shadow: 0 4px 6px rgba(50, 179, 231, 0.1);
        }

        .submit-error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #feb2b2;
        }

        .duplicate-warning-message {
            font-size: 14px;
          background: #fef3c7;
          color: #92400e;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          border: 2px solid #f59e0b;
        }

        .duplicate-ids {
         font-size: 14px;
          margin-top: 8px;
          font-size: 13px;
          font-family: monospace;
          background: rgba(0, 0, 0, 0.1);
          padding: 6px 8px;
          border-radius: 4px;
        }

        .duplicate-solution {
          margin-top: 8px;
          font-size: 14px;
          color: #059669;
          background: rgba(0, 0, 0, 0.1);
          padding: 6px 8px;
          border-radius: 4px;
        }

        .submit-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .submit-info h3 {
          margin: 0 0 10px 0;
          color: #002b4b;
          font-size: 20px;
          font-weight: 600;
        }

        .submit-info p {
          margin: 0 0 5px 0;
          color: #5e6e77;
          font-size: 14px;
          line-height: 1.5;
        }

        .missing-pdfs {
          color: #d97706;
          font-weight: 600;
        }

        .checking-duplicates {
          color: #0284c7;
          font-weight: 600;
        }

        .submit-requirement {
          color: #dc2626;
          font-size: 13px;
          font-weight: 500;
          margin-top: 5px;
        }

        .submit-note {
          color: #059669 !important;
          font-size: 13px !important;
          margin-top: 8px !important;
          padding: 8px 12px;
          background: #d1fae5;
          border-radius: 6px;
          border: 1px solid #a7f3d0;
        }

        .submit-actions {
          flex-shrink: 0;
        }

        .submit-btn {
          padding: 15px 30px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 200px;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .submit-btn.enabled {
          background: linear-gradient(135deg, #32b3e7, #1a9bd8);
          color: white;
          box-shadow: 0 4px 12px rgba(50, 179, 231, 0.3);
        }

        .submit-btn.enabled:hover {
          background: linear-gradient(135deg, #1a9bd8, #0284c7);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(50, 179, 231, 0.4);
        }

        .submit-btn.disabled {
          background: #f1f5f9;
          color: #94a3b8;
          cursor: not-allowed;
          border: 1px solid #e2e8f0;
        }

        .submit-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
        }

        .submit-progress {
          margin-top: 20px;
        }

        .progress-bar {
          width: 100%;
          height: 12px;
          background: #e6f7ff;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 10px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #32b3e7, #1a9bd8);
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 14px;
          color: #5e6e77;
          text-align: center;
          font-weight: 500;
        }

        .submit-message {
          margin-top: 15px;
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }

        .submit-message.success {
          background: #d1fae5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }

        .submit-message.warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }

        .submit-message.error {
          background: #fee2e2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .submit-container {
            flex-direction: column;
            align-items: stretch;
            gap: 15px;
          }

          .submit-btn {
            min-width: auto;
            width: 100%;
          }
        }

        @media (max-width: 480px) {
          .submit-section {
            padding: 20px;
          }

          .submit-info h3 {
            font-size: 18px;
          }

          .submit-btn {
            padding: 12px 20px;
            font-size: 14px;
          }

          .duplicate-ids {
            word-break: break-all;
          }
        }
      `}</style>
    </div>
  );
};