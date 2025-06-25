// components/InvoiceViewer.tsx - Updated with DaysToDueDate, Format column, and enhanced sorting
import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

type SortableField = 'issueDate' | 'dueDate' | 'amount' | 'daysToDueDate' | 'invoiceId' | 'sellerId' | 'debtorId' | 'product' | 'currency' | 'format';

// Extend Window interface to include our refresh function
declare global {
  interface Window {
    refreshInvoiceViewer?: () => void;
  }
}

export const InvoiceViewer: React.FC = () => {
  const [invoices, setInvoices] = useState<Schema["Invoice"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortableField>('issueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [hoveredInvalidRow, setHoveredInvalidRow] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const itemsPerPage = 20;

  // Manual refresh function
  const refreshInvoices = async () => {
    try {
      setLoading(true);
      console.log('🔄 [DEBUG] Manually refreshing invoices...');
      
      const result = await client.models.Invoice.list();
      if (result.errors) {
        console.error('❌ [DEBUG] Error fetching invoices:', result.errors);
        setError('Failed to refresh invoices');
      } else {
        console.log('✅ [DEBUG] Manual refresh successful, found', result.data?.length || 0, 'invoices');
        setInvoices(result.data || []);
        setError(null);
      }
    } catch (err) {
      console.error('💥 [DEBUG] Exception during manual refresh:', err);
      setError('Failed to refresh invoices');
    } finally {
      setLoading(false);
    }
  };

  // Load invoices with real-time updates and manual refresh capability
  useEffect(() => {
    console.log('🔄 [DEBUG] Setting up invoice subscription (refreshKey:', refreshKey, ')');
    
    const subscription = client.models.Invoice.observeQuery().subscribe({
      next: ({ items }) => {
        console.log('📊 [DEBUG] Received subscription update with', items.length, 'invoices');
        setInvoices(items);
        setLoading(false);
      },
      error: (err) => {
        console.error('❌ [DEBUG] Subscription error:', err);
        setError('Failed to load invoices');
        setLoading(false);
      }
    });

    return () => {
      console.log('🧹 [DEBUG] Cleaning up invoice subscription');
      subscription.unsubscribe();
    };
  }, [refreshKey]); // Add refreshKey as dependency to force re-subscription

  // Expose refresh function globally for other components to use
  useEffect(() => {
    // Store the refresh function globally so UploadStore can call it
    window.refreshInvoiceViewer = () => {
      console.log('🔄 [DEBUG] External refresh triggered');
      setRefreshKey(prev => prev + 1);
      setTimeout(refreshInvoices, 500); // Small delay to ensure deletion is processed
    };

    // Cleanup
    return () => {
      delete window.refreshInvoiceViewer;
    };
  }, []);

  // Calculate simplified analytics
  const analytics = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    const totalAmount = validInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    return {
      totalInvoices: validInvoices.length,
      totalAmount
    };
  }, [invoices]);

  // Calculate days between issue date and due date
  const calculateDaysToDueDate = (issueDate: string, dueDate: string): number => {
    const issue = new Date(issueDate);
    const due = new Date(dueDate);
    const diffTime = due.getTime() - issue.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Sort invoices
  const sortedInvoices = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    
    return validInvoices.sort((a, b) => {
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
          aValue = calculateDaysToDueDate(a.issueDate, a.dueDate);
          bValue = calculateDaysToDueDate(b.issueDate, b.dueDate);
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getValidationErrorsTooltip = (errors: (string | null)[] | null | undefined) => {
    if (!errors) return '';
    return errors.filter((error): error is string => error !== null).join('; ');
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

      {/* Analytics Cards - Only Total Invoices and Total Value */}
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="card-icon">📋</div>
          <div className="card-content">
            <div className="card-number">{analytics.totalInvoices.toLocaleString()}</div>
            <div className="card-label">Total Invoices</div>
          </div>
        </div>
        
        <div className="analytics-card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <div className="card-number">${analytics.totalAmount.toLocaleString()}</div>
            <div className="card-label">Total Value</div>
          </div>
        </div>
      </div>

      {/* Results Summary with Refresh Button */}
      <div className="results-summary">
        <div className="summary-content">
          <p>
            Showing {paginatedInvoices.length} of {sortedInvoices.length} invoices
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
                className={`sortable ${sortBy === 'daysToDueDate' ? 'active' : ''}`}
                onClick={() => handleSort('daysToDueDate')}
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
                className={`sortable ${sortBy === 'format' ? 'active' : ''}`}
                onClick={() => handleSort('format')}
              >
                Format {sortBy === 'format' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{formatDate(invoice.issueDate)}</td>
                <td>{formatDate(invoice.dueDate)}</td>
                <td className="days-to-due-cell">
                  {calculateDaysToDueDate(invoice.issueDate, invoice.dueDate)}
                </td>
                <td className="invoice-id">{invoice.invoiceId}</td>
                <td className="seller-id">{invoice.sellerId}</td>
                <td className="debtor-id">{invoice.debtorId}</td>
                <td className="product-cell">{invoice.product}</td>
                <td className="currency-cell">{invoice.currency}</td>
                <td className="amount-cell">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </td>
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
          min-width: 1200px; /* Increased for additional columns */
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

        .days-to-due-cell {
          text-align: center;
          font-weight: 500;
          color: #5e6e77;
        }

        .format-cell {
          text-align: center;
          position: relative;
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
          .debtor-id {
            max-width: 100px;
          }

          .validation-tooltip {
            width: 250px;
          }
        }

        @media (max-width: 480px) {
          .validation-tooltip {
            width: 200px;
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
};