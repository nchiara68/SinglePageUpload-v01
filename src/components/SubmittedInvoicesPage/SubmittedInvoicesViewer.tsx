// components/SubmittedInvoicesViewer.tsx - Display submitted invoices data
import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

const client = generateClient<Schema>();

type SortableField = 'submittedAt' | 'submittedBy' | 'invoiceId' | 'sellerId' | 'debtorId' | 'amount' | 'currency' | 'product' | 'originalUploadJobId';

export const SubmittedInvoicesViewer: React.FC = () => {
  const [submittedInvoices, setSubmittedInvoices] = useState<Schema["SubmittedInvoice"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableField>('submittedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Enhanced manual refresh function
  const refreshSubmittedInvoices = async () => {
    try {
      setLoading(true);
      console.log('🔄 [DEBUG] Refreshing submitted invoices...');
      
      const result = await client.models.SubmittedInvoice.list();
      if (result.errors) {
        console.error('❌ [DEBUG] Error fetching submitted invoices:', result.errors);
        setError('Failed to load submitted invoices');
      } else {
        console.log('✅ [DEBUG] Submitted invoices loaded:', result.data?.length || 0, 'records');
        setSubmittedInvoices(result.data || []);
        setError(null);
      }
    } catch (err) {
      console.error('💥 [DEBUG] Exception during submitted invoices refresh:', err);
      setError('Failed to load submitted invoices');
    } finally {
      setLoading(false);
    }
  };

  // Load submitted invoices with real-time updates
  useEffect(() => {
    console.log('🔄 [DEBUG] Setting up submitted invoices loading');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let subscription: any; // Use any to avoid complex typing issues with Amplify observeQuery
    let isMounted = true;
    
    const setupDataLoading = async () => {
      try {
        // Initial manual load
        console.log('📊 [DEBUG] Initial submitted invoices load...');
        const initialResult = await client.models.SubmittedInvoice.list();
        
        if (isMounted && !initialResult.errors && initialResult.data) {
          console.log('✅ [DEBUG] Initial submitted invoices load successful:', initialResult.data.length, 'records');
          setSubmittedInvoices(initialResult.data);
          setLoading(false);
        }
        
        // Setup real-time subscription
        console.log('📊 [DEBUG] Setting up submitted invoices subscription...');
        subscription = client.models.SubmittedInvoice.observeQuery().subscribe({
          next: ({ items, isSynced }) => {
            if (isMounted) {
              console.log('📊 [DEBUG] Submitted invoices subscription update:', {
                itemCount: items.length,
                isSynced
              });
              setSubmittedInvoices(items);
              setLoading(false);
            }
          },
          error: (err) => {
            if (isMounted) {
              console.error('❌ [DEBUG] Submitted invoices subscription error:', err);
              setError('Failed to load submitted invoices');
              setLoading(false);
            }
          }
        });
        
      } catch (error) {
        if (isMounted) {
          console.error('💥 [DEBUG] Submitted invoices setup error:', error);
          setError('Failed to initialize submitted invoices loading');
          setLoading(false);
        }
      }
    };
    
    setupDataLoading();

    return () => {
      isMounted = false;
      if (subscription && typeof subscription.unsubscribe === 'function') {
        console.log('🧹 [DEBUG] Cleaning up submitted invoices subscription');
        subscription.unsubscribe();
      }
    };
  }, []);

  // Calculate analytics for submitted invoices
  const analytics = useMemo(() => {
    const totalAmount = submittedInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    
    // Group by submittedBy (user who submitted)
    const submittedByGroups = submittedInvoices.reduce((acc, inv) => {
      const submittedBy = inv.submittedBy || 'Unknown';
      acc[submittedBy] = (acc[submittedBy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Group by currency
    const currencyGroups = submittedInvoices.reduce((acc, inv) => {
      const currency = inv.currency || 'Unknown';
      acc[currency] = (acc[currency] || 0) + (inv.amount || 0);
      return acc;
    }, {} as Record<string, number>);

    // Group by month for recent activity
    const monthlyGroups = submittedInvoices.reduce((acc, inv) => {
      const date = new Date(inv.submittedAt || '');
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      acc[monthKey] = (acc[monthKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('📊 [DEBUG] Submitted invoices analytics calculated:', {
      total: submittedInvoices.length,
      totalAmount,
      submittedByGroups,
      currencyGroups,
      monthlyGroups
    });

    return {
      totalInvoices: submittedInvoices.length,
      totalAmount,
      submittedByGroups,
      currencyGroups,
      monthlyGroups,
      uniqueSubmitters: Object.keys(submittedByGroups),
      uniqueCurrencies: Object.keys(currencyGroups)
    };
  }, [submittedInvoices]);

  // Sort submitted invoices
  const sortedInvoices = useMemo(() => {
    console.log('📊 [DEBUG] Sorting submitted invoices. Total:', submittedInvoices.length);
    
    return submittedInvoices.sort((a, b) => {
      let aValue: string | number | Date, bValue: string | number | Date;
      
      switch (sortBy) {
        case 'submittedAt':
          aValue = new Date(a.submittedAt || '').getTime();
          bValue = new Date(b.submittedAt || '').getTime();
          break;
        case 'amount':
          aValue = a.amount || 0;
          bValue = b.amount || 0;
          break;
        case 'submittedBy':
          aValue = (a.submittedBy || '').toLowerCase();
          bValue = (b.submittedBy || '').toLowerCase();
          break;
        case 'invoiceId':
          aValue = (a.invoiceId || '').toLowerCase();
          bValue = (b.invoiceId || '').toLowerCase();
          break;
        case 'sellerId':
          aValue = (a.sellerId || '').toLowerCase();
          bValue = (b.sellerId || '').toLowerCase();
          break;
        case 'debtorId':
          aValue = (a.debtorId || '').toLowerCase();
          bValue = (b.debtorId || '').toLowerCase();
          break;
        case 'product':
          aValue = (a.product || '').toLowerCase();
          bValue = (b.product || '').toLowerCase();
          break;
        case 'currency':
          aValue = a.currency || '';
          bValue = b.currency || '';
          break;
        case 'originalUploadJobId':
          aValue = (a.originalUploadJobId || '').toLowerCase();
          bValue = (b.originalUploadJobId || '').toLowerCase();
          break;
        default:
          aValue = new Date(a.submittedAt || '').getTime();
          bValue = new Date(b.submittedAt || '').getTime();
          break;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [submittedInvoices, sortBy, sortDirection]);

  // Paginate results
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedInvoices, currentPage]);

  const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage);

  const handleSort = (field: SortableField) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const formatCurrency = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${currency || 'USD'} ${amount.toFixed(2)}`;
    }
  };

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
    }
  };

  if (loading) {
    return (
      <div className="submitted-invoices-viewer loading">
        <div className="loading-content">
          <div className="spinner">🔄</div>
          <p>Loading submitted invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="submitted-invoices-viewer">
      {/* Page Header */}
      <div className="page-header">
        <h1>📋 Submitted Invoices</h1>
        <p>View and manage all invoices that have been submitted for processing.</p>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Analytics Cards */}
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="card-content">
            <div className="card-number">{analytics.totalInvoices.toLocaleString()}</div>
            <div className="card-label">Total Submitted Invoices</div>
            {analytics.uniqueSubmitters.length > 0 && (
              <div className="card-breakdown">
                {analytics.uniqueSubmitters.slice(0, 3).map(submitter => (
                  <span key={submitter} className="status-item">
                    {submitter}: {analytics.submittedByGroups[submitter]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="analytics-card">
          <div className="card-content">
            <div className="card-number">${analytics.totalAmount.toLocaleString()}</div>
            <div className="card-label">Total Submitted Value</div>
            {analytics.uniqueCurrencies.length > 1 && (
              <div className="card-breakdown">
                Multiple currencies: {analytics.uniqueCurrencies.join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Summary with Refresh Button */}
      <div className="results-summary">
        <div className="summary-content">
          <p>
            Showing {paginatedInvoices.length} of {sortedInvoices.length} submitted invoices
          </p>
          <button 
            onClick={refreshSubmittedInvoices}
            className="refresh-btn"
            disabled={loading}
            title="Refresh submitted invoices data"
          >
            {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {submittedInvoices.length === 0 ? (
        <div className="no-data">
          <div className="no-data-content">
            <div className="no-data-icon">📋</div>
            <h3>No Submitted Invoices Found</h3>
            <p>There are currently no invoices that have been submitted for processing.</p>
            <p>Submitted invoices will appear here once you submit invoices from the upload page.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Submitted Invoices Table */}
          <div className="invoices-table-container">
            <table className="invoices-table">
              <thead>
                <tr>
                  <th 
                    className={`sortable ${sortBy === 'submittedAt' ? 'active' : ''}`}
                    onClick={() => handleSort('submittedAt')}
                  >
                    Submitted At {sortBy === 'submittedAt' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className={`sortable ${sortBy === 'submittedBy' ? 'active' : ''}`}
                    onClick={() => handleSort('submittedBy')}
                  >
                    Submitted By {sortBy === 'submittedBy' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                    Seller ID {sortBy === 'sellerId' && (sortDirection === 'asc' ? '↑' : '↓')}
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
                  <th 
                    className={`sortable ${sortBy === 'originalUploadJobId' ? 'active' : ''}`}
                    onClick={() => handleSort('originalUploadJobId')}
                  >
                    Original Upload Job {sortBy === 'originalUploadJobId' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="datetime-cell">
                      {formatDateTime(invoice.submittedAt)}
                    </td>
                    <td className="submitted-by">
                      {invoice.submittedBy || 'Unknown'}
                    </td>
                    <td className="invoice-id">
                      {invoice.invoiceId || 'N/A'}
                    </td>
                    <td className="seller-id">
                      {invoice.sellerId || 'N/A'}
                    </td>
                    <td className="debtor-id">
                      {invoice.debtorId || 'N/A'}
                    </td>
                    <td className="product-cell">
                      {invoice.product || 'N/A'}
                    </td>
                    <td className="currency-cell">
                      {invoice.currency || 'N/A'}
                    </td>
                    <td className="amount-cell">
                      {invoice.amount != null ? formatCurrency(invoice.amount, invoice.currency || 'USD') : 'N/A'}
                    </td>
                    <td className="upload-job-id">
                      {invoice.originalUploadJobId || 'N/A'}
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
        </>
      )}

      <style>{`
        .submitted-invoices-viewer {
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .page-header {
          margin-bottom: 30px;
          text-align: left;
        }

        .page-header h1 {
          margin: 0 0 10px 0;
          color: #002b4b;
          font-size: 32px;
          font-weight: 700;
        }

        .page-header p {
          margin: 0;
          color: #5e6e77;
          font-size: 16px;
          line-height: 1.5;
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
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
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
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .analytics-card {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 25px;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .analytics-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(50, 179, 231, 0.2);
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
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .status-item {
          background: #f0f9ff;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
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

        .no-data {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 60px 40px;
          text-align: center;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
        }

        .no-data-content {
          max-width: 500px;
          margin: 0 auto;
        }

        .no-data-icon {
          font-size: 64px;
          margin-bottom: 20px;
          opacity: 0.5;
        }

        .no-data h3 {
          margin: 0 0 15px 0;
          color: #002b4b;
          font-size: 24px;
          font-weight: 600;
        }

        .no-data p {
          margin: 0 0 10px 0;
          color: #5e6e77;
          font-size: 16px;
          line-height: 1.5;
        }

        .invoices-table-container {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          overflow-x: auto;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
          margin-bottom: 20px;
        }

        .invoices-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1200px;
        }

        .invoices-table th {
          background: #f8fcff;
          border-bottom: 1px solid #32b3e7;
          padding: 15px 12px;
          text-align: left;
          font-weight: 600;
          color: #002b4b;
          white-space: nowrap;
          position: sticky;
          top: 0;
        }

        .invoices-table th.sortable {
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }

        .invoices-table th.sortable:hover {
          background: #e6f7ff;
        }

        .invoices-table th.active {
          background: #32b3e7;
          color: white;
        }

        .invoices-table td {
          padding: 12px;
          border-bottom: 1px solid #e6f7ff;
          white-space: nowrap;
        }

        .invoices-table tr:hover {
          background: #f8fcff;
        }

        .datetime-cell {
          font-size: 13px;
          color: #5e6e77;
          min-width: 150px;
        }

        .submitted-by, .invoice-id, .seller-id, .debtor-id, .upload-job-id {
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
          .submitted-invoices-viewer {
            padding: 15px;
          }

          .page-header h1 {
            font-size: 28px;
          }

          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .no-data {
            padding: 40px 20px;
          }

          .no-data-icon {
            font-size: 48px;
          }

          .invoices-table-container {
            font-size: 14px;
          }

          .invoices-table th,
          .invoices-table td {
            padding: 10px 8px;
          }

          .datetime-cell {
            min-width: 120px;
            font-size: 12px;
          }

          .product-cell,
          .submitted-by,
          .invoice-id,
          .seller-id,
          .debtor-id,
          .upload-job-id {
            max-width: 100px;
          }
        }

        @media (max-width: 480px) {
          .page-header h1 {
            font-size: 24px;
          }

          .no-data h3 {
            font-size: 20px;
          }

          .no-data p {
            font-size: 14px;
          }

          .datetime-cell {
            min-width: 100px;
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
};