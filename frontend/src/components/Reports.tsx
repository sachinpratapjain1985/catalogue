import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download,
  Calendar,
  Layers,
  Printer
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
}

interface ReportRow {
  id: number;
  sets_changed: number;
  pieces_changed: number;
  created_at: string;
  previous_sets: number;
  new_sets: number;
  sku_id: string;
  pieces_per_set: number;
  category_name: string;
  stockist_name: string;
}

interface ReportsProps {
  token: string;
}

export default function Reports({ token }: ReportsProps) {
  const [reportType, setReportType] = useState<'addition' | 'reduction'>('addition');
  const [categories, setCategories] = useState<Category[]>([]);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [searchSku, setSearchSku] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [reportType, startDate, endDate, selectedCatId, searchSku]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/admin/categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('startDate', new Date(startDate).toISOString());
      if (endDate) {
        // Extend to end of the selected day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        queryParams.append('endDate', end.toISOString());
      }
      if (selectedCatId) queryParams.append('categoryId', selectedCatId);
      if (searchSku) queryParams.append('search', searchSku);

      const endpoint = reportType === 'addition' ? '/api/admin/reports/additions' : '/api/admin/reports/reductions';
      
      const response = await fetch(`${endpoint}?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      }
    } catch (e) {
      console.error('Failed to fetch report data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (reportData.length === 0) return;

    // Define CSV Headers
    const headers = [
      'Timestamp',
      'Stockist/User',
      'Category Folder',
      'SKU ID',
      'Pieces Per Set',
      'Sets Changed',
      'Pieces Changed',
      'Previous Sets',
      'New Sets'
    ];

    // Format Rows
    const rows = reportData.map(row => {
      const date = new Date(row.created_at);
      const timestamp = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      return [
        `"${timestamp}"`,
        `"${row.stockist_name}"`,
        `"${row.category_name}"`,
        `"${row.sku_id}"`,
        row.pieces_per_set,
        row.sets_changed,
        row.pieces_changed,
        row.previous_sets,
        row.new_sets
      ];
    });

    // Construct CSV Content
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    // Create Download Link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = `stock_${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (reportData.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const title = reportType === 'addition' ? 'Inventory Stock Additions Audit Report' : 'Inventory Stock Reductions (Sold) Audit Report';
    
    // Calculate summaries
    const totalSets = reportData.reduce((sum, r) => sum + Number(r.sets_changed), 0);
    const totalPieces = reportData.reduce((sum, r) => sum + Number(r.pieces_changed), 0);
    const dateRangeStr = (startDate || endDate) 
      ? `Filters: ${startDate || 'All Time'} to ${endDate || 'Present'}`
      : 'All Recorded Logs';

    const tableRowsHtml = reportData.map(row => {
      const date = new Date(row.created_at);
      const dateTimeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <tr>
          <td>${dateTimeStr}</td>
          <td>${row.stockist_name}</td>
          <td>${row.category_name}</td>
          <td><strong>${row.sku_id}</strong></td>
          <td style="text-align: center;">${row.pieces_per_set} pc/set</td>
          <td style="text-align: right; font-weight: bold; color: ${reportType === 'addition' ? '#059669' : '#dc2626'}">
            ${reportType === 'addition' ? '+' : '-'}${row.sets_changed}
          </td>
          <td style="text-align: right; font-weight: bold; color: ${reportType === 'addition' ? '#059669' : '#dc2626'}">
            ${reportType === 'addition' ? '+' : '-'}${row.pieces_changed}
          </td>
          <td style="text-align: center; color: #4b5563;">${row.previous_sets} &rarr; ${row.new_sets}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: 'Segoe UI', Roboto, sans-serif;
            color: #1f2937;
            background: #ffffff;
            margin: 20mm 15mm 20mm 15mm;
            font-size: 11pt;
            line-height: 1.4;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #374151;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .company-name {
            font-size: 20pt;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: #111827;
          }
          .report-title {
            font-size: 14pt;
            font-weight: 700;
            color: #4b5563;
            margin-top: 4px;
          }
          .meta-info {
            font-size: 9pt;
            color: #4b5563;
            text-align: right;
          }
          .summary-box {
            display: flex;
            gap: 20px;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 20px;
          }
          .summary-card {
            flex: 1;
          }
          .summary-title {
            font-size: 8pt;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6b7280;
            font-weight: 600;
          }
          .summary-value {
            font-size: 16pt;
            font-weight: 700;
            color: #111827;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            font-size: 9.5pt;
          }
          th {
            background-color: #374151;
            color: #ffffff;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 8pt;
            letter-spacing: 0.05em;
            padding: 8px 12px;
            border: 1px solid #374151;
          }
          td {
            padding: 8px 12px;
            border: 1px solid #e5e7eb;
          }
          tr:nth-child(even) td {
            background-color: #f9fafb;
          }
          .footer {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
            font-size: 9pt;
            color: #6b7280;
          }
          .signature-line {
            border-top: 1px solid #9ca3af;
            width: 200px;
            text-align: center;
            padding-top: 5px;
            margin-top: 40px;
          }
          @media print {
            body { margin: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company-name">DESUKA FASHION</div>
            <div class="report-title">${title}</div>
            <div style="font-size: 10pt; color: #4b5563; margin-top: 4px;">${dateRangeStr}</div>
          </div>
          <div class="meta-info">
            <div>Printed: ${new Date().toLocaleString()}</div>
            <div>Total Logs: ${reportData.length} records</div>
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-card">
            <div class="summary-title">Total Sets Shifted</div>
            <div class="summary-value" style="color: ${reportType === 'addition' ? '#059669' : '#dc2626'}">
              ${reportType === 'addition' ? '+' : '-'}${totalSets} sets
            </div>
          </div>
          <div class="summary-card">
            <div class="summary-title">Total Pieces Shifted</div>
            <div class="summary-value" style="color: ${reportType === 'addition' ? '#059669' : '#dc2626'}">
              ${reportType === 'addition' ? '+' : '-'}${totalPieces} pieces
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Stockist Name</th>
              <th>Category Folder</th>
              <th>SKU ID</th>
              <th style="text-align: center;">Set Size</th>
              <th style="text-align: right;">Sets Delta</th>
              <th style="text-align: right;">Pieces Delta</th>
              <th style="text-align: center;">Stock Shift</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>
            <p>System Generated Audit Trail Report</p>
            <p>Desuka Fashion Catalog Manager &copy; ${new Date().getFullYear()}</p>
          </div>
          <div>
            <div class="signature-line">Authorized Signature</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="flex-between">
        <div>
          <h1>Stock Audit Reports</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Track audit trails for stock additions and items sold</p>
        </div>
        
        {/* Toggle Report Type */}
        <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px', border: '1px solid var(--glass-border)' }}>
          <button 
            className={`btn ${reportType === 'addition' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType('addition')}
            style={{ padding: '0.5rem 1rem', borderRadius: 'calc(var(--radius-md) - 2px)' }}
          >
            Additions Log
          </button>
          <button 
            className={`btn ${reportType === 'reduction' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType('reduction')}
            style={{ padding: '0.5rem 1rem', borderRadius: 'calc(var(--radius-md) - 2px)' }}
          >
            Sold (Reductions) Log
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="var(--color-primary)" />
          Filter Report Logs
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {/* Start Date */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={12} />
              Start Date
            </label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          {/* End Date */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Calendar size={12} />
              End Date
            </label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>

          {/* Folder Category */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Layers size={12} />
              Category Folder
            </label>
            <select 
              value={selectedCatId}
              onChange={e => setSelectedCatId(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* SKU Search */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Search size={12} />
              Search SKU ID
            </label>
            <input 
              type="text" 
              placeholder="e.g. SKU-100" 
              value={searchSku}
              onChange={e => setSearchSku(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Report Data Table */}
      <div className="glass-card">
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <h3>
            {reportType === 'addition' ? 'Inventory Additions Log' : 'Inventory Reductions (Sold) Log'}
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.9rem', marginLeft: '0.5rem' }}>
              ({reportData.length} records found)
            </span>
          </h3>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              onClick={handleExportCSV} 
              className="btn btn-secondary"
              disabled={reportData.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Download size={16} />
              Export to CSV
            </button>
            <button 
              onClick={handleExportPDF} 
              className="btn btn-primary"
              disabled={reportData.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: 'none' }}
            >
              <Printer size={16} />
              Export to PDF
            </button>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Stockist / User</th>
                <th>Category Folder</th>
                <th>SKU ID</th>
                <th style={{ textAlign: 'center' }}>Set Size</th>
                <th style={{ textAlign: 'right' }}>Sets Delta</th>
                <th style={{ textAlign: 'right' }}>Pieces Delta</th>
                <th style={{ textAlign: 'center' }}>Stock Shift (Sets)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                    Loading audit trail reports...
                  </td>
                </tr>
              ) : reportData.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No audit records match the current filters.
                  </td>
                </tr>
              ) : (
                reportData.map((row) => {
                  const date = new Date(row.created_at);
                  const dateTimeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={row.id}>
                      <td>{dateTimeStr}</td>
                      <td style={{ fontWeight: 600 }}>{row.stockist_name}</td>
                      <td>{row.category_name}</td>
                      <td style={{ fontFamily: 'Outfit', fontWeight: 600 }}>{row.sku_id}</td>
                      <td style={{ textAlign: 'center' }}>{row.pieces_per_set} pc/set</td>
                      <td style={{ 
                        textAlign: 'right', 
                        fontWeight: 700, 
                        color: reportType === 'addition' ? 'var(--color-success)' : 'var(--color-danger)' 
                      }}>
                        {reportType === 'addition' ? `+${row.sets_changed}` : `-${row.sets_changed}`}
                      </td>
                      <td style={{ 
                        textAlign: 'right', 
                        fontWeight: 700, 
                        color: reportType === 'addition' ? 'var(--color-success)' : 'var(--color-danger)' 
                      }}>
                        {reportType === 'addition' ? `+${row.pieces_changed}` : `-${row.pieces_changed}`}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {row.previous_sets} → {row.new_sets}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
