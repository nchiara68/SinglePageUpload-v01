// components/InvoiceViewer.tsx - Updated with New Theme Colors & Fixed ESLint Error
import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface InvoiceFilters {
  currency: string;
  dateRange: 'all' | 'last7days' | 'last30days' | 'last6months';
  minAmount: string;
  maxAmount: string;
  searchTerm: string;
}

export const InvoiceViewer: React.FC = () => {
  const [invoices, setInvoices] = useState<Schema["Invoice"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InvoiceFilters>({
    currency: 'all',
    dateRange: 'all',
    minAmount: '',
    maxAmount: '',
    searchTerm: ''
  });
  const [sortBy, setSortBy] = useState<'issueDate' | 'dueDate' | 'amount'>('issueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Load invoices with real-time updates
  useEffect(() => {
    const subscription = client.models.Invoice.observeQuery().subscribe({
      next: ({ items }) => {
        setInvoices(items);
        setLoading(false);
      },
      error: (err) => {
        console.error('Error loading invoices:', err);
        setError('Failed to load invoices');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Calculate analytics
  const analytics = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    
    const totalAmount = validInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const averageAmount = validInvoices.length > 0 ? totalAmount / validInvoices.length : 0;
    
    const currencyBreakdown = validInvoices.reduce((acc, inv) => {
      acc[inv.currency] = (acc[inv.currency] || 0) + inv.amount;
      return acc;
    }, {} as Record<string, number>);

    const now = new Date();
    const overdueInvoices = validInvoices.filter(inv => 
      new Date(inv.dueDate) < now
    );

    const dueSoon = validInvoices.filter(inv => {
      const dueDate = new Date(inv.dueDate);
      const daysDiff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 0 && daysDiff <= 7;
    });

    return {
      totalInvoices: validInvoices.length,
      totalAmount,
      averageAmount,
      currencyBreakdown,
      overdueCount: overdueInvoices.length,
      dueSoonCount: dueSoon.length,
      invalidCount: invoices.length - validInvoices.length
    };
  }, [invoices]);

  // Filter and sort invoices
  const filteredAndSortedInvoices = useMemo(() => {
    const filtered = invoices.filter(invoice => {
      // Currency filter
      if (filters.currency !== 'all' && invoice.currency !== filters.currency) {
        return false;
      }

      // Date range filter
      if (filters.dateRange !== 'all') {
        const now = new Date();
        const invoiceDate = new Date(invoice.issueDate);
        let daysBack = 0;
        
        switch (filters.dateRange) {
          case 'last7days': daysBack = 7; break;
          case 'last30days': daysBack = 30; break;
          case 'last6months': daysBack = 180; break;
        }
        
        const cutoffDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
        if (invoiceDate < cutoffDate) return false;
      }

      // Amount range filter
      if (filters.minAmount && invoice.amount < parseFloat(filters.minAmount)) {
        return false;
      }
      if (filters.maxAmount && invoice.amount > parseFloat(filters.maxAmount)) {
        return false;
      }

      // Search term filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        return (
          invoice.invoiceId.toLowerCase().includes(searchLower) ||
          invoice.product.toLowerCase().includes(searchLower) ||
          invoice.sellerId.toLowerCase().includes(searchLower) ||
          invoice.debtorId.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue, bValue;
      
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

    return filtered;
  }, [invoices, filters, sortBy, sortDirection]);

  // Paginate results
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedInvoices, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedInvoices.length / itemsPerPage);

  const handleSort = (field: typeof sortBy) => {
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

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const isDueSoon = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const daysDiff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff >= 0 && daysDiff <= 7;
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
      <div className="viewer-header">
        <h2>📊 Invoice Dashboard</h2>
        <p>View and analyze your processed invoice data</p>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Analytics Cards */}
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
        
        <div className="analytics-card">
          <div className="card-icon">📈</div>
          <div className="card-content">
            <div className="card-number">${analytics.averageAmount.toLocaleString()}</div>
            <div className="card-label">Average Value</div>
          </div>
        </div>
        
        <div className="analytics-card overdue">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <div className="card-number">{analytics.overdueCount}</div>
            <div className="card-label">Overdue</div>
          </div>
        </div>
        
        <div className="analytics-card due-soon">
          <div className="card-icon">⏰</div>
          <div className="card-content">
            <div className="card-number">{analytics.dueSoonCount}</div>
            <div className="card-label">Due Soon</div>
          </div>
        </div>
        
        {analytics.invalidCount > 0 && (
          <div className="analytics-card invalid">
            <div className="card-icon">❌</div>
            <div className="card-content">
              <div className="card-number">{analytics.invalidCount}</div>
              <div className="card-label">Invalid</div>
            </div>
          </div>
        )}
      </div>

      {/* Currency Breakdown */}
      {Object.keys(analytics.currencyBreakdown).length > 0 && (
        <div className="currency-breakdown">
          <h3>💱 Currency Breakdown</h3>
          <div className="currency-grid">
            {Object.entries(analytics.currencyBreakdown).map(([currency, amount]) => (
              <div key={currency} className="currency-item">
                <span className="currency-code">{currency}</span>
                <span className="currency-amount">{formatCurrency(amount, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <h3>🔍 Filters & Search</h3>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Currency</label>
            <select 
              value={filters.currency} 
              onChange={(e) => {
                setFilters({...filters, currency: e.target.value});
                setCurrentPage(1);
              }}
            >
              <option value="all">All Currencies</option>
              {Object.keys(analytics.currencyBreakdown).map(currency => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range</label>
            <select 
              value={filters.dateRange} 
              onChange={(e) => {
                setFilters({...filters, dateRange: e.target.value as 'all' | 'last7days' | 'last30days' | 'last6months'});
                setCurrentPage(1);
              }}
            >
              <option value="all">All Time</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="last6months">Last 6 Months</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Min Amount</label>
            <input 
              type="number" 
              placeholder="0"
              value={filters.minAmount}
              onChange={(e) => {
                setFilters({...filters, minAmount: e.target.value});
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="filter-group">
            <label>Max Amount</label>
            <input 
              type="number" 
              placeholder="No limit"
              value={filters.maxAmount}
              onChange={(e) => {
                setFilters({...filters, maxAmount: e.target.value});
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="filter-group search-group">
            <label>Search</label>
            <input 
              type="text" 
              placeholder="Search invoices, products, IDs..."
              value={filters.searchTerm}
              onChange={(e) => {
                setFilters({...filters, searchTerm: e.target.value});
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
        
        <button 
          className="clear-filters-btn"
          onClick={() => {
            setFilters({
              currency: 'all',
              dateRange: 'all',
              minAmount: '',
              maxAmount: '',
              searchTerm: ''
            });
            setCurrentPage(1);
          }}
        >
          Clear All Filters
        </button>
      </div>

      {/* Results Summary */}
      <div className="results-summary">
        <p>
          Showing {paginatedInvoices.length} of {filteredAndSortedInvoices.length} invoices
          {filteredAndSortedInvoices.length !== analytics.totalInvoices && 
            ` (filtered from ${analytics.totalInvoices} total)`
          }
        </p>
      </div>

      {/* Invoice Table */}
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
              <th>Invoice ID</th>
              <th>Product</th>
              <th>Currency</th>
              <th 
                className={`sortable ${sortBy === 'amount' ? 'active' : ''}`}
                onClick={() => handleSort('amount')}
              >
                Amount {sortBy === 'amount' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedInvoices.map((invoice) => (
              <tr 
                key={invoice.id} 
                className={`
                  ${!invoice.isValid ? 'invalid-row' : ''} 
                  ${isOverdue(invoice.dueDate) ? 'overdue-row' : ''} 
                  ${isDueSoon(invoice.dueDate) ? 'due-soon-row' : ''}
                `}
              >
                <td>{formatDate(invoice.issueDate)}</td>
                <td>{formatDate(invoice.dueDate)}</td>
                <td className="invoice-id">{invoice.invoiceId}</td>
                <td className="product-cell">{invoice.product}</td>
                <td className="currency-cell">{invoice.currency}</td>
                <td className="amount-cell">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </td>
                <td className="status-cell">
                  {!invoice.isValid ? (
                    <span className="status-badge invalid">❌ Invalid</span>
                  ) : isOverdue(invoice.dueDate) ? (
                    <span className="status-badge overdue">⚠️ Overdue</span>
                  ) : isDueSoon(invoice.dueDate) ? (
                    <span className="status-badge due-soon">⏰ Due Soon</span>
                  ) : (
                    <span className="status-badge valid">✅ Valid</span>
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
          max-width: 1200px;
          margin: 0 auto;
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

        .viewer-header {
          margin-bottom: 30px;
          text-align: center;
          border-bottom: 2px solid #32b3e7;
          padding-bottom: 20px;
        }

        .viewer-header h2 {
          margin: 0 0 10px 0;
          color: #002b4b;
          font-size: 28px;
        }

        .viewer-header p {
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

        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }

        .analytics-card {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 15px;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .analytics-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(50, 179, 231, 0.2);
        }

        .analytics-card.overdue {
          border-left: 4px solid #ef4444;
        }

        .analytics-card.due-soon {
          border-left: 4px solid #f59e0b;
        }

        .analytics-card.invalid {
          border-left: 4px solid #dc2626;
        }

        .card-icon {
          font-size: 24px;
        }

        .card-content {
          flex: 1;
        }

        .card-number {
          font-size: 24px;
          font-weight: 700;
          color: #002b4b;
          margin-bottom: 5px;
        }

        .card-label {
          font-size: 14px;
          color: #5e6e77;
          font-weight: 500;
        }

        .currency-breakdown {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 30px;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
        }

        .currency-breakdown h3 {
          margin: 0 0 15px 0;
          color: #002b4b;
        }

        .currency-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
        }

        .currency-item {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #f8fcff;
          border-radius: 4px;
          border: 1px solid #32b3e7;
        }

        .currency-code {
          font-weight: 600;
          color: #002b4b;
        }

        .currency-amount {
          color: #5e6e77;
        }

        .filters-section {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
        }

        .filters-section h3 {
          margin: 0 0 15px 0;
          color: #002b4b;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 15px;
        }

        .search-group {
          grid-column: 1 / -1;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
        }

        .filter-group label {
          margin-bottom: 5px;
          font-weight: 500;
          color: #5e6e77;
          font-size: 14px;
        }

        .filter-group select,
        .filter-group input {
          padding: 8px 12px;
          border: 1px solid #32b3e7;
          border-radius: 4px;
          font-size: 14px;
          background: white;
        }

        .filter-group select:focus,
        .filter-group input:focus {
          outline: none;
          border-color: #32b3e7;
          box-shadow: 0 0 0 3px rgba(50, 179, 231, 0.1);
        }

        .clear-filters-btn {
          padding: 8px 16px;
          background: #f8fcff;
          border: 1px solid #32b3e7;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          color: #5e6e77;
          transition: background 0.2s;
        }

        .clear-filters-btn:hover {
          background: #e6f7ff;
          color: #002b4b;
        }

        .results-summary {
          margin-bottom: 15px;
          color: #5e6e77;
          font-size: 14px;
        }

        .invoice-table-container {
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 8px;
          overflow: auto;
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.1);
          margin-bottom: 20px;
        }

        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 800px;
        }

        .invoice-table th {
          background: #f8fcff;
          border-bottom: 1px solid #32b3e7;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #002b4b;
          position: sticky;
          top: 0;
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
          padding: 12px;
          border-bottom: 1px solid #e6f7ff;
        }

        .invoice-table tr:hover {
          background: #f8fcff;
        }

        .invoice-table tr.overdue-row {
          background: #fef2f2;
        }

        .invoice-table tr.due-soon-row {
          background: #fffbeb;
        }

        .invoice-table tr.invalid-row {
          background: #fef2f2;
          opacity: 0.7;
        }

        .invoice-id {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #5e6e77;
        }

        .product-cell {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .currency-cell {
          font-weight: 600;
          color: #002b4b;
        }

        .amount-cell {
          font-weight: 600;
          text-align: right;
          color: #32b3e7;
        }

        .status-cell {
          text-align: center;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }

        .status-badge.valid {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.overdue {
          background: #fee2e2;
          color: #dc2626;
        }

        .status-badge.due-soon {
          background: #fef3c7;
          color: #d97706;
        }

        .status-badge.invalid {
          background: #fee2e2;
          color: #dc2626;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          padding: 20px;
        }

        .pagination-btn {
          padding: 8px 16px;
          background: white;
          border: 1px solid #32b3e7;
          border-radius: 4px;
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
        }

        @media (max-width: 768px) {
          .invoice-viewer {
            padding: 15px;
          }

          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .filters-grid {
            grid-template-columns: 1fr;
          }

          .invoice-table-container {
            font-size: 14px;
          }

          .invoice-table th,
          .invoice-table td {
            padding: 8px;
          }

          .product-cell {
            max-width: 120px;
          }
        }
      `}</style>
    </div>
  );
};