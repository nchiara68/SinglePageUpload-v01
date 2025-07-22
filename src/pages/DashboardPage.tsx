// src/pages/DashboardPage.tsx - Main Dashboard Page - TypeScript Fixed
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface Subscription {
  unsubscribe: () => void;
}

// Updated interface with user elements removed
export interface DashboardPageProps {
  // Props can be added here as needed
}


const DashboardPage: React.FC<DashboardPageProps> = () => {
  const [invoices, setInvoices] = useState<Schema["Invoice"]["type"][]>([]);
  const [submittedInvoices, setSubmittedInvoices] = useState<Schema["SubmittedInvoice"]["type"][]>([]);
  const [uploadJobs, setUploadJobs] = useState<Schema["InvoiceUploadJob"]["type"][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async (): Promise<void> => {
      try {
        setLoading(true);
        console.log('📊 [DASHBOARD] Loading dashboard data...');

        // Load all data in parallel
        const [invoicesResult, submittedResult, jobsResult] = await Promise.all([
          client.models.Invoice.list(),
          client.models.SubmittedInvoice.list(),
          client.models.InvoiceUploadJob.list()
        ]);

        if (invoicesResult.errors) {
          console.error('❌ [DASHBOARD] Error loading invoices:', invoicesResult.errors);
        } else {
          setInvoices(invoicesResult.data || []);
          console.log('✅ [DASHBOARD] Loaded invoices:', invoicesResult.data?.length || 0);
        }

        if (submittedResult.errors) {
          console.error('❌ [DASHBOARD] Error loading submitted invoices:', submittedResult.errors);
        } else {
          setSubmittedInvoices(submittedResult.data || []);
          console.log('✅ [DASHBOARD] Loaded submitted invoices:', submittedResult.data?.length || 0);
        }

        if (jobsResult.errors) {
          console.error('❌ [DASHBOARD] Error loading upload jobs:', jobsResult.errors);
        } else {
          setUploadJobs(jobsResult.data || []);
          console.log('✅ [DASHBOARD] Loaded upload jobs:', jobsResult.data?.length || 0);
        }

        setError(null);
      } catch (err) {
        console.error('💥 [DASHBOARD] Error loading dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();

    // Set up real-time subscriptions for live updates with proper typing
    let invoiceSubscription: Subscription | null = null;
    let submittedSubscription: Subscription | null = null;
    let jobsSubscription: Subscription | null = null;

    try {
      console.log('📊 [DASHBOARD] Setting up real-time subscriptions...');
      
      invoiceSubscription = client.models.Invoice.observeQuery().subscribe({
        next: ({ items }) => {
          console.log('📊 [DASHBOARD] Invoice subscription update:', items.length);
          setInvoices(items);
        },
        error: (err: Error) => console.error('❌ [DASHBOARD] Invoice subscription error:', err)
      });

      submittedSubscription = client.models.SubmittedInvoice.observeQuery().subscribe({
        next: ({ items }) => {
          console.log('📊 [DASHBOARD] Submitted invoice subscription update:', items.length);
          setSubmittedInvoices(items);
        },
        error: (err: Error) => console.error('❌ [DASHBOARD] Submitted invoice subscription error:', err)
      });

      jobsSubscription = client.models.InvoiceUploadJob.observeQuery().subscribe({
        next: ({ items }) => {
          console.log('📊 [DASHBOARD] Upload jobs subscription update:', items.length);
          setUploadJobs(items);
        },
        error: (err: Error) => console.error('❌ [DASHBOARD] Upload jobs subscription error:', err)
      });

      console.log('✅ [DASHBOARD] Real-time subscriptions established');
    } catch (err) {
      console.error('❌ [DASHBOARD] Error setting up subscriptions:', err);
    }

    // Cleanup subscriptions
    return () => {
      console.log('🧹 [DASHBOARD] Cleaning up subscriptions');
      if (invoiceSubscription && typeof invoiceSubscription.unsubscribe === 'function') {
        invoiceSubscription.unsubscribe();
      }
      if (submittedSubscription && typeof submittedSubscription.unsubscribe === 'function') {
        submittedSubscription.unsubscribe();
      }
      if (jobsSubscription && typeof jobsSubscription.unsubscribe === 'function') {
        jobsSubscription.unsubscribe();
      }
    };
  }, []);

  // Calculate dashboard analytics
  const analytics = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.isValid);
    const invalidInvoices = invoices.filter(inv => !inv.isValid);
    
    const activeInvoicesValue = validInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const submittedInvoicesValue = submittedInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    
    const recentJobs = uploadJobs
      .filter(job => job.processingCompletedAt)
      .sort((a, b) => new Date(b.processingCompletedAt!).getTime() - new Date(a.processingCompletedAt!).getTime())
      .slice(0, 5);

    const recentInvoices = invoices
      .sort((a, b) => new Date(b.uploadDate || '').getTime() - new Date(a.uploadDate || '').getTime())
      .slice(0, 5);

    const processingStats = uploadJobs.reduce((acc, job) => {
      const status = job.status || 'UNKNOWN';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate days to due date for active invoices
    const today = new Date();
    const overdueInvoices = validInvoices.filter(inv => {
      const dueDate = new Date(inv.dueDate);
      return dueDate < today;
    });

    const dueSoonInvoices = validInvoices.filter(inv => {
      const dueDate = new Date(inv.dueDate);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });

    return {
      totalActiveInvoices: invoices.length,
      validActiveInvoices: validInvoices.length,
      invalidActiveInvoices: invalidInvoices.length,
      totalSubmittedInvoices: submittedInvoices.length,
      activeInvoicesValue,
      submittedInvoicesValue,
      totalProcessingJobs: uploadJobs.length,
      recentJobs,
      recentInvoices,
      processingStats,
      overdueInvoices: overdueInvoices.length,
      dueSoonInvoices: dueSoonInvoices.length
    };
  }, [invoices, submittedInvoices, uploadJobs]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'status-completed';
      case 'processing': return 'status-processing';
      case 'failed': return 'status-failed';
      case 'pending': return 'status-pending';
      default: return 'status-unknown';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="loading-container">
          <div className="loading-content">
            <div className="spinner">🔄</div>
            <h3>Loading Dashboard...</h3>
            <p>Gathering your invoice data</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Welcome Header */}
      <div className="dashboard-header">
        <div className="welcome-section">
          <h1>Dashboard</h1>
          <p></p>
        </div>
        <div className="quick-actions">
          {/* Quick action buttons can be added here as needed */}
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card primary">
          <div className="metric-icon"></div>
          <div className="metric-content">
            <div className="metric-number">{analytics.totalActiveInvoices.toLocaleString()}</div>
            <div className="metric-label">Active Invoices</div>
            {analytics.invalidActiveInvoices > 0 && (
              <div className="metric-detail">
                ✅ {analytics.validActiveInvoices} Valid • ❌ {analytics.invalidActiveInvoices} Invalid
              </div>
            )}
          </div>
        </div>

        <div className="metric-card success">
          <div className="metric-icon"></div>
          <div className="metric-content">
            <div className="metric-number">{formatCurrency(analytics.activeInvoicesValue)}</div>
            <div className="metric-label">Active Value</div>
            <div className="metric-detail">From valid invoices only</div>
          </div>
        </div>

        <div className="metric-card info">
          <div className="metric-icon"></div>
          <div className="metric-content">
            <div className="metric-number">{analytics.totalSubmittedInvoices.toLocaleString()}</div>
            <div className="metric-label">Submitted Invoices</div>
            <div className="metric-detail">{formatCurrency(analytics.submittedInvoicesValue)} Total Value</div>
          </div>
        </div>

        <div className="metric-card warning">
          <div className="metric-icon">⚠️</div>
          <div className="metric-content">
            <div className="metric-number">{analytics.overdueInvoices + analytics.dueSoonInvoices}</div>
            <div className="metric-label">Needs Attention</div>
            <div className="metric-detail">
              🔴 {analytics.overdueInvoices} Overdue • 🟡 {analytics.dueSoonInvoices} Due Soon
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="content-grid">
        {/* Recent Activity */}
        <div className="content-card">
          <div className="card-header">
            <h3>📈 Recent Upload Jobs</h3>
            <Link to="/upload" className="card-link">View All</Link>
          </div>
          <div className="card-content">
            {analytics.recentJobs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📤</div>
                <p>No recent upload jobs</p>
                <Link to="/upload" className="empty-action">Upload Your First File</Link>
              </div>
            ) : (
              <div className="activity-list">
                {analytics.recentJobs.map((job) => (
                  <div key={job.id} className="activity-item">
                    <div className="activity-info">
                      <div className="activity-title">{job.fileName}</div>
                      <div className="activity-details">
                        {job.successfulInvoices || 0} successful • {job.failedInvoices || 0} failed
                      </div>
                    </div>
                    <div className="activity-meta">
                      <span className={`status-badge ${getStatusBadgeClass(job.status || '')}`}>
                        {job.status}
                      </span>
                      <div className="activity-date">{formatDateTime(job.processingCompletedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="content-card">
          <div className="card-header">
            <h3>📄 Recent Invoices</h3>
            <Link to="/upload" className="card-link">View All</Link>
          </div>
          <div className="card-content">
            {analytics.recentInvoices.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <p>No recent invoices</p>
                <Link to="/upload" className="empty-action">Process Your First Invoice</Link>
              </div>
            ) : (
              <div className="invoices-list">
                {analytics.recentInvoices.map((invoice) => (
                  <div key={invoice.id} className={`invoice-item ${!invoice.isValid ? 'invalid' : ''}`}>
                    <div className="invoice-info">
                      <div className="invoice-id">{invoice.invoiceId}</div>
                      <div className="invoice-details">
                        {invoice.product} • {formatCurrency(invoice.amount)} {invoice.currency}
                      </div>
                    </div>
                    <div className="invoice-meta">
                      <span className={`format-badge ${invoice.isValid ? 'valid' : 'invalid'}`}>
                        {invoice.isValid ? '✅ Valid' : '❌ Invalid'}
                      </span>
                      <div className="invoice-date">{formatDateTime(invoice.uploadDate)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Processing Statistics */}
      {Object.keys(analytics.processingStats).length > 0 && (
        <div className="stats-section">
          <h3>📊 Processing Statistics</h3>
          <div className="stats-grid">
            {Object.entries(analytics.processingStats).map(([status, count]) => (
              <div key={status} className={`stat-item ${getStatusBadgeClass(status)}`}>
                <div className="stat-number">{count}</div>
                <div className="stat-label">{status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .dashboard-page {
          padding: 30px;
          max-width: 1400px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          min-height: calc(100vh - 70px);
          background: linear-gradient(135deg, #f8fcff 0%, #e6f7ff 100%);
        }

        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 60vh;
        }

        .loading-content {
          text-align: center;
          color: #5e6e77;
        }

        .loading-content .spinner {
          font-size: 48px;
          margin-bottom: 20px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .loading-content h3 {
          margin: 0 0 10px 0;
          color: #002b4b;
          font-size: 24px;
        }

        .loading-content p {
          margin: 0;
          font-size: 16px;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(10px);
          padding: 30px;
          border-radius: 16px;
          border: 1px solid rgba(50, 179, 231, 0.2);
        }

        .welcome-section h1 {
          margin: 0 0 8px 0;
          color: #002b4b;
          font-size: 32px;
          font-weight: 700;
        }

        .welcome-section p {
          margin: 0;
          color: #5e6e77;
          font-size: 16px;
        }

        .quick-actions {
          display: flex;
          gap: 12px;
        }

        .quick-action-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s;
          white-space: nowrap;
          border: none;
          cursor: pointer;
          font-size: 14px;
        }

        .quick-action-btn.primary {
          background: linear-gradient(135deg, #32b3e7, #1a9bd8);
          color: white;
          box-shadow: 0 4px 12px rgba(50, 179, 231, 0.3);
        }

        .quick-action-btn.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(50, 179, 231, 0.4);
        }

        .quick-action-btn.secondary {
          background: rgba(255, 255, 255, 0.9);
          color: #002b4b;
          border: 1px solid rgba(50, 179, 231, 0.3);
        }

        .quick-action-btn.secondary:hover {
          background: rgba(50, 179, 231, 0.1);
          transform: translateY(-1px);
        }

        .quick-action-btn.tertiary {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .quick-action-btn.tertiary:hover {
          background: rgba(239, 68, 68, 0.15);
          transform: translateY(-1px);
        }

        .action-icon {
          font-size: 16px;
        }

        .error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 30px;
          border: 1px solid #feb2b2;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 24px;
          margin-bottom: 40px;
        }

        .metric-card {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          border: 1px solid rgba(50, 179, 231, 0.2);
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(50, 179, 231, 0.1);
        }

        .metric-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(50, 179, 231, 0.15);
        }

        .metric-card.primary {
          border-left: 4px solid #32b3e7;
        }

        .metric-card.success {
          border-left: 4px solid #10b981;
        }

        .metric-card.info {
          border-left: 4px solid #6366f1;
        }

        .metric-card.warning {
          border-left: 4px solid #f59e0b;
        }

        .metric-icon {
          font-size: 40px;
          opacity: 0.8;
        }

        .metric-content {
          flex: 1;
        }

        .metric-number {
          font-size: 28px;
          font-weight: 700;
          color: #002b4b;
          margin-bottom: 4px;
        }

        .metric-label {
          font-size: 14px;
          color: #5e6e77;
          font-weight: 600;
          margin-bottom: 6px;
        }

        .metric-detail {
          font-size: 12px;
          color: #9ca3af;
          line-height: 1.4;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 40px;
        }

        .content-card {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          border: 1px solid rgba(50, 179, 231, 0.2);
          box-shadow: 0 4px 12px rgba(50, 179, 231, 0.1);
          overflow: hidden;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(50, 179, 231, 0.1);
          background: rgba(248, 252, 255, 0.5);
        }

        .card-header h3 {
          margin: 0;
          color: #002b4b;
          font-size: 18px;
          font-weight: 600;
        }

        .card-link {
          color: #32b3e7;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
        }

        .card-link:hover {
          color: #1a9bd8;
        }

        .card-content {
          padding: 24px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
        }

        .empty-icon {
          font-size: 48px;
          opacity: 0.5;
          margin-bottom: 16px;
        }

        .empty-state p {
          margin: 0 0 16px 0;
          color: #9ca3af;
          font-size: 16px;
        }

        .empty-action {
          color: #32b3e7;
          text-decoration: none;
          font-weight: 600;
          padding: 8px 16px;
          border: 1px solid #32b3e7;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .empty-action:hover {
          background: #32b3e7;
          color: white;
        }

        .activity-list, .invoices-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .activity-item, .invoice-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: rgba(248, 252, 255, 0.5);
          border-radius: 8px;
          border: 1px solid rgba(50, 179, 231, 0.1);
          transition: all 0.2s;
        }

        .activity-item:hover, .invoice-item:hover {
          background: rgba(50, 179, 231, 0.05);
          transform: translateY(-1px);
        }

        .invoice-item.invalid {
          background: rgba(254, 242, 242, 0.8);
          border-color: rgba(239, 68, 68, 0.2);
        }

        .activity-info, .invoice-info {
          flex: 1;
        }

        .activity-title, .invoice-id {
          font-weight: 600;
          color: #002b4b;
          margin-bottom: 4px;
          font-size: 14px;
        }

        .activity-details, .invoice-details {
          font-size: 12px;
          color: #5e6e77;
        }

        .activity-meta, .invoice-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }

        .activity-date, .invoice-date {
          font-size: 12px;
          color: #9ca3af;
        }

        .status-badge, .format-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-badge.status-completed, .format-badge.valid {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.status-processing {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-badge.status-failed, .format-badge.invalid {
          background: #fee2e2;
          color: #dc2626;
        }

        .status-badge.status-pending {
          background: #fef3c7;
          color: #92400e;
        }

        .status-badge.status-unknown {
          background: #f3f4f6;
          color: #374151;
        }

        .stats-section {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 24px;
          border: 1px solid rgba(50, 179, 231, 0.2);
          box-shadow: 0 4px 12px rgba(50, 179, 231, 0.1);
        }

        .stats-section h3 {
          margin: 0 0 20px 0;
          color: #002b4b;
          font-size: 18px;
          font-weight: 600;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
        }

        .stat-item {
          text-align: center;
          padding: 16px;
          background: rgba(248, 252, 255, 0.5);
          border-radius: 8px;
          border: 1px solid rgba(50, 179, 231, 0.1);
        }

        .stat-number {
          font-size: 24px;
          font-weight: 700;
          color: #002b4b;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: #5e6e77;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        /* Responsive Design */
        @media (max-width: 1024px) {
          .content-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-header {
            flex-direction: column;
            gap: 20px;
            text-align: center;
          }
        }

        @media (max-width: 768px) {
          .dashboard-page {
            padding: 20px;
          }

          .dashboard-header {
            padding: 20px;
          }

          .welcome-section h1 {
            font-size: 24px;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .metric-card {
            padding: 20px;
          }

          .quick-actions {
            flex-direction: column;
            width: 100%;
          }

          .quick-action-btn {
            justify-content: center;
          }

          .stats-grid {
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          }
        }

        @media (max-width: 480px) {
          .dashboard-page {
            padding: 15px;
          }

          .welcome-section h1 {
            font-size: 20px;
          }

          .metric-number {
            font-size: 24px;
          }

          .activity-item, .invoice-item {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .activity-meta, .invoice-meta {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
};

export default DashboardPage;