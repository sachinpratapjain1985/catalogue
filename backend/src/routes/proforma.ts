import { Router, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireProformaAccess, AuthenticatedRequest } from '../middleware/auth';
import ExcelJS from 'exceljs';

const router = Router();

// Protect all proforma routes with authentication and proforma permission
router.use(authenticateToken);
router.use(requireProformaAccess);

// Helper: Generate next invoice number (e.g. PI-2610-001)
const generateInvoiceNumber = async (): Promise<string> => {
  const now = new Date();
  const yearSuffix = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `PI-${yearSuffix}${month}-`;

  const res = await query(
    `SELECT invoice_number FROM proforma_invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );

  if (res.rows.length === 0) {
    return `${prefix}001`;
  }

  const lastNumStr = res.rows[0].invoice_number.replace(prefix, '');
  const lastNum = parseInt(lastNumStr, 10);
  const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
  return `${prefix}${nextNum.toString().padStart(3, '0')}`;
};

// GET /api/admin/proforma/next-number - Get preview of next invoice number
router.get('/next-number', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const nextNumber = await generateInvoiceNumber();
    res.json({ nextInvoiceNumber: nextNumber });
  } catch (err) {
    console.error('Error generating next invoice number:', err);
    res.status(500).json({ error: 'Failed to generate invoice number' });
  }
});

// GET /api/admin/proforma - List proforma invoices with search, filters, pagination
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, status, startDate, endDate, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (search && (search as string).trim() !== '') {
      const term = `%${(search as string).trim()}%`;
      whereClauses.push(`(
        p.invoice_number ILIKE $${paramIndex} OR 
        p.customer_name ILIKE $${paramIndex} OR 
        p.business_name ILIKE $${paramIndex} OR 
        p.phone ILIKE $${paramIndex} OR 
        p.city ILIKE $${paramIndex} OR
        p.gst_number ILIKE $${paramIndex}
      )`);
      params.push(term);
      paramIndex++;
    }

    if (status && (status as string).trim() !== '') {
      whereClauses.push(`p.status = $${paramIndex}`);
      params.push((status as string).trim());
      paramIndex++;
    }

    if (startDate) {
      whereClauses.push(`p.invoice_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`p.invoice_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total records
    const countRes = await query(
      `SELECT COUNT(*) FROM proforma_invoices p ${whereStr}`,
      params
    );
    const totalRecords = parseInt(countRes.rows[0].count, 10);

    // Fetch invoices with creator info and item counts
    const listRes = await query(
      `SELECT p.id, p.invoice_number, p.invoice_date, p.valid_until, p.customer_name, p.business_name,
              p.city, p.phone, p.gst_number, p.total_sets, p.total_pieces, p.subtotal_taxable,
              p.total_gst_amount, p.grand_total, p.status, p.created_at, p.updated_at,
              u.username as created_by_username,
              COUNT(pi.id) as items_count
       FROM proforma_invoices p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN proforma_invoice_items pi ON p.id = pi.proforma_id
       ${whereStr}
       GROUP BY p.id, u.username
       ORDER BY p.id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      invoices: listRes.rows,
      total: totalRecords,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalRecords / limitNum),
    });
  } catch (err) {
    console.error('Error fetching proforma list:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
});

// GET /api/admin/proforma/:id - Get single proforma invoice with all line items
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    const invRes = await query(
      `SELECT p.*, u.username as created_by_username, uu.username as updated_by_username
       FROM proforma_invoices p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN users uu ON p.updated_by = uu.id
       WHERE p.id = $1`,
      [id]
    );

    if (invRes.rows.length === 0) {
      res.status(404).json({ error: 'Proforma invoice not found' });
      return;
    }

    const invoice = invRes.rows[0];

    // Fetch line items
    const itemsRes = await query(
      `SELECT pi.*, i.image_path as catalog_image_path
       FROM proforma_invoice_items pi
       LEFT JOIN items i ON pi.item_id = i.id
       WHERE pi.proforma_id = $1
       ORDER BY pi.sort_order ASC, pi.id ASC`,
      [id]
    );

    invoice.items = itemsRes.rows;
    res.json(invoice);
  } catch (err) {
    console.error('Error fetching proforma invoice:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
});

// Helper: Calculate invoice totals and items
interface RawItemInput {
  itemId?: number | null;
  articleNumber: string;
  description?: string;
  piecesPerSet?: number;
  sets?: number;
  quantity?: number;
  rate: number;
  gstRate?: number;
}

const computeInvoiceData = (rawItems: RawItemInput[]) => {
  let totalSets = 0;
  let totalPieces = 0;
  let subtotalTaxable = 0;
  let totalGst5 = 0;
  let totalGst18 = 0;

  const processedItems = rawItems.map((item, index) => {
    const piecesPerSet = Math.max(1, parseInt(item.piecesPerSet as any, 10) || 1);
    const sets = Math.max(0, parseInt(item.sets as any, 10) || 1);
    const quantity = sets * piecesPerSet;
    const rate = Math.max(0, parseFloat(item.rate as any) || 0);
    const taxableAmount = Math.round(quantity * rate * 100) / 100;

    // GST Rule: <= 2500 is 5%, > 2500 is 18% (unless explicitly specified)
    let gstRate = item.gstRate !== undefined ? parseFloat(item.gstRate as any) : (rate <= 2500 ? 5 : 18);
    if (isNaN(gstRate)) gstRate = rate <= 2500 ? 5 : 18;

    const gstAmount = Math.round(taxableAmount * (gstRate / 100) * 100) / 100;
    const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;

    totalSets += sets;
    totalPieces += quantity;
    subtotalTaxable += taxableAmount;
    if (gstRate === 5) {
      totalGst5 += gstAmount;
    } else {
      totalGst18 += gstAmount;
    }

    return {
      itemId: item.itemId || null,
      articleNumber: item.articleNumber ? item.articleNumber.trim() : 'CUSTOM',
      description: item.description ? item.description.trim() : '',
      piecesPerSet,
      sets,
      quantity,
      rate,
      taxableAmount,
      gstRate,
      gstAmount,
      totalAmount,
      sortOrder: index + 1,
    };
  });

  subtotalTaxable = Math.round(subtotalTaxable * 100) / 100;
  totalGst5 = Math.round(totalGst5 * 100) / 100;
  totalGst18 = Math.round(totalGst18 * 100) / 100;
  const totalGstAmount = Math.round((totalGst5 + totalGst18) * 100) / 100;
  const unrounded = subtotalTaxable + totalGstAmount;
  const grandTotal = Math.round(unrounded);
  const roundOff = Math.round((grandTotal - unrounded) * 100) / 100;

  return {
    totalSets,
    totalPieces,
    subtotalTaxable,
    totalGst5,
    totalGst18,
    totalGstAmount,
    roundOff,
    grandTotal,
    processedItems,
  };
};

// POST /api/admin/proforma - Create new proforma invoice
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      invoiceNumber,
      invoiceDate,
      validUntil,
      customerName,
      businessName,
      city,
      address,
      gstNumber,
      phone,
      state,
      stateCode,
      companyName,
      companyBrand,
      companyAddress,
      companyGst,
      companyPhone,
      companyEmail,
      bankName,
      bankAccountNo,
      bankIfsc,
      bankBranch,
      isInterstate,
      status,
      notes,
      termsConditions,
      items,
    } = req.body;

    if (!customerName || !customerName.trim()) {
      res.status(400).json({ error: 'Customer Name is required' });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'At least one item is required in the proforma invoice' });
      return;
    }

    // Auto-generate or use unique invoice number
    let finalInvoiceNumber = (invoiceNumber && invoiceNumber.trim()) ? invoiceNumber.trim() : await generateInvoiceNumber();

    // Check collision
    const existing = await query('SELECT id FROM proforma_invoices WHERE invoice_number = $1', [finalInvoiceNumber]);
    if (existing.rows.length > 0) {
      finalInvoiceNumber = await generateInvoiceNumber();
    }

    const {
      totalSets,
      totalPieces,
      subtotalTaxable,
      totalGst5,
      totalGst18,
      totalGstAmount,
      roundOff,
      grandTotal,
      processedItems,
    } = computeInvoiceData(items);

    const clientUserId = req.user?.id || null;

    // Insert invoice
    const insertInvRes = await query(
      `INSERT INTO proforma_invoices (
        invoice_number, invoice_date, valid_until, customer_name, business_name,
        city, address, gst_number, phone, state, state_code,
        company_name, company_brand, company_address, company_gst, company_phone, company_email,
        bank_name, bank_account_no, bank_ifsc, bank_branch,
        total_sets, total_pieces, subtotal_taxable, total_gst_5, total_gst_18, total_gst_amount,
        round_off, grand_total, is_interstate, status, notes, terms_conditions,
        created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32, $33,
        $34, $35
      ) RETURNING *`,
      [
        finalInvoiceNumber,
        invoiceDate || new Date(),
        validUntil || null,
        customerName.trim(),
        (businessName || '').trim(),
        (city || '').trim(),
        (address || '').trim(),
        (gstNumber || '').trim().toUpperCase(),
        (phone || '').trim(),
        (state || 'Delhi').trim(),
        (stateCode || '07').trim(),
        companyName || 'VS FASHION',
        companyBrand || 'DESUKA',
        companyAddress || 'IX/6344, Subhash Mohalla, Gandhi Nagar, Delhi - 110031',
        companyGst || '',
        companyPhone || '+91 99992 49455',
        companyEmail || 'sales@desukafashion.com',
        bankName || 'HDFC BANK',
        bankAccountNo || '',
        bankIfsc || '',
        bankBranch || 'Gandhi Nagar, Delhi',
        totalSets,
        totalPieces,
        subtotalTaxable,
        totalGst5,
        totalGst18,
        totalGstAmount,
        roundOff,
        grandTotal,
        !!isInterstate,
        status || 'draft',
        (notes || '').trim(),
        termsConditions || '1. Goods once sold will not be taken back or exchanged.\n2. Payment terms: 100% advance before dispatch.\n3. Subject to Delhi jurisdiction only.',
        clientUserId,
        clientUserId,
      ]
    );

    const newInvoice = insertInvRes.rows[0];

    // Insert line items
    for (const item of processedItems) {
      await query(
        `INSERT INTO proforma_invoice_items (
          proforma_id, item_id, article_number, description, pieces_per_set,
          sets, quantity, rate, taxable_amount, gst_rate, gst_amount, total_amount, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          newInvoice.id,
          item.itemId,
          item.articleNumber,
          item.description,
          item.piecesPerSet,
          item.sets,
          item.quantity,
          item.rate,
          item.taxableAmount,
          item.gstRate,
          item.gstAmount,
          item.totalAmount,
          item.sortOrder,
        ]
      );
    }

    newInvoice.items = processedItems;
    res.status(201).json(newInvoice);
  } catch (err) {
    console.error('Error creating proforma invoice:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
});

// PUT /api/admin/proforma/:id - Update existing proforma invoice
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    const {
      invoiceNumber,
      invoiceDate,
      validUntil,
      customerName,
      businessName,
      city,
      address,
      gstNumber,
      phone,
      state,
      stateCode,
      companyName,
      companyBrand,
      companyAddress,
      companyGst,
      companyPhone,
      companyEmail,
      bankName,
      bankAccountNo,
      bankIfsc,
      bankBranch,
      isInterstate,
      status,
      notes,
      termsConditions,
      items,
    } = req.body;

    if (!customerName || !customerName.trim()) {
      res.status(400).json({ error: 'Customer Name is required' });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'At least one item is required in the proforma invoice' });
      return;
    }

    const existingRes = await query('SELECT id FROM proforma_invoices WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      res.status(404).json({ error: 'Proforma invoice not found' });
      return;
    }

    const {
      totalSets,
      totalPieces,
      subtotalTaxable,
      totalGst5,
      totalGst18,
      totalGstAmount,
      roundOff,
      grandTotal,
      processedItems,
    } = computeInvoiceData(items);

    const clientUserId = req.user?.id || null;

    // Update invoice record
    const updateRes = await query(
      `UPDATE proforma_invoices SET
        invoice_number = $1, invoice_date = $2, valid_until = $3, customer_name = $4, business_name = $5,
        city = $6, address = $7, gst_number = $8, phone = $9, state = $10, state_code = $11,
        company_name = $12, company_brand = $13, company_address = $14, company_gst = $15, company_phone = $16, company_email = $17,
        bank_name = $18, bank_account_no = $19, bank_ifsc = $20, bank_branch = $21,
        total_sets = $22, total_pieces = $23, subtotal_taxable = $24, total_gst_5 = $25, total_gst_18 = $26, total_gst_amount = $27,
        round_off = $28, grand_total = $29, is_interstate = $30, status = $31, notes = $32, terms_conditions = $33,
        updated_by = $34, updated_at = CURRENT_TIMESTAMP
       WHERE id = $35
       RETURNING *`,
      [
        invoiceNumber,
        invoiceDate || new Date(),
        validUntil || null,
        customerName.trim(),
        (businessName || '').trim(),
        (city || '').trim(),
        (address || '').trim(),
        (gstNumber || '').trim().toUpperCase(),
        (phone || '').trim(),
        (state || 'Delhi').trim(),
        (stateCode || '07').trim(),
        companyName || 'VS FASHION',
        companyBrand || 'DESUKA',
        companyAddress || 'IX/6344, Subhash Mohalla, Gandhi Nagar, Delhi - 110031',
        companyGst || '',
        companyPhone || '+91 99992 49455',
        companyEmail || 'sales@desukafashion.com',
        bankName || 'HDFC BANK',
        bankAccountNo || '',
        bankIfsc || '',
        bankBranch || 'Gandhi Nagar, Delhi',
        totalSets,
        totalPieces,
        subtotalTaxable,
        totalGst5,
        totalGst18,
        totalGstAmount,
        roundOff,
        grandTotal,
        !!isInterstate,
        status || 'draft',
        (notes || '').trim(),
        termsConditions || '1. Goods once sold will not be taken back or exchanged.\n2. Payment terms: 100% advance before dispatch.\n3. Subject to Delhi jurisdiction only.',
        clientUserId,
        id,
      ]
    );

    // Replace items
    await query('DELETE FROM proforma_invoice_items WHERE proforma_id = $1', [id]);
    for (const item of processedItems) {
      await query(
        `INSERT INTO proforma_invoice_items (
          proforma_id, item_id, article_number, description, pieces_per_set,
          sets, quantity, rate, taxable_amount, gst_rate, gst_amount, total_amount, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          item.itemId,
          item.articleNumber,
          item.description,
          item.piecesPerSet,
          item.sets,
          item.quantity,
          item.rate,
          item.taxableAmount,
          item.gstRate,
          item.gstAmount,
          item.totalAmount,
          item.sortOrder,
        ]
      );
    }

    const updated = updateRes.rows[0];
    updated.items = processedItems;
    res.json(updated);
  } catch (err) {
    console.error('Error updating proforma invoice:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
});

// DELETE /api/admin/proforma/:id - Delete proforma invoice
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    const deleteRes = await query('DELETE FROM proforma_invoices WHERE id = $1 RETURNING id, invoice_number', [id]);
    if (deleteRes.rows.length === 0) {
      res.status(404).json({ error: 'Proforma invoice not found' });
      return;
    }

    res.json({ message: `Proforma invoice ${deleteRes.rows[0].invoice_number} deleted successfully` });
  } catch (err) {
    console.error('Error deleting proforma invoice:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
});

// GET /api/admin/proforma/:id/excel - Generate and download styled Excel (.xlsx) file
router.get('/:id/excel', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid invoice ID' });
      return;
    }

    const invRes = await query(
      `SELECT p.*, u.username as created_by_username
       FROM proforma_invoices p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1`,
      [id]
    );

    if (invRes.rows.length === 0) {
      res.status(404).json({ error: 'Proforma invoice not found' });
      return;
    }

    const inv = invRes.rows[0];
    const itemsRes = await query(
      `SELECT * FROM proforma_invoice_items WHERE proforma_id = $1 ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    const items = itemsRes.rows;

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VS Fashion / DESUKA';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Proforma Invoice', {
      views: [{ showGridLines: true }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Set Column Widths
    sheet.columns = [
      { key: 'colA', width: 6 },   // Sr No
      { key: 'colB', width: 22 },  // Article / Item
      { key: 'colC', width: 26 },  // Description
      { key: 'colD', width: 10 },  // Sets
      { key: 'colE', width: 10 },  // Pcs/Set
      { key: 'colF', width: 12 },  // Total Qty
      { key: 'colG', width: 14 },  // Rate (₹)
      { key: 'colH', width: 16 },  // Taxable (₹)
      { key: 'colI', width: 10 },  // GST %
      { key: 'colJ', width: 14 },  // GST Amt (₹)
      { key: 'colK', width: 18 },  // Total Amount (₹)
    ];

    // Colors and Styles
    const darkNavy = '1E293B';
    const softGold = 'C29B38';
    const headerBg = '0F172A';
    const lightGrayBg = 'F8FAFC';
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'E2E8F0' } },
      left: { style: 'thin', color: { argb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
      right: { style: 'thin', color: { argb: 'E2E8F0' } },
    };

    // Row 1: Brand Title
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${inv.company_brand || 'DESUKA'} by ${inv.company_name || 'VS FASHION'}`;
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: softGold } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 32;

    // Row 2: Subtitle / Address
    sheet.mergeCells('A2:K2');
    const subCell = sheet.getCell('A2');
    subCell.value = `${inv.company_address || 'Gandhi Nagar, Delhi'} | Phone: ${inv.company_phone || '+91 99992 49455'} | GSTIN: ${inv.company_gst || 'N/A'}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '64748B' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // Row 3: Document Title Banner
    sheet.mergeCells('A3:K3');
    const docBanner = sheet.getCell('A3');
    docBanner.value = 'PROFORMA INVOICE';
    docBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
    docBanner.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFF' } };
    docBanner.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 26;

    // Row 4: Empty space
    sheet.getRow(4).height = 8;

    // Row 5 - 8: Buyer & Invoice Info Split
    // Left: Buyer Details (A to F)
    sheet.mergeCells('A5:F5');
    sheet.getCell('A5').value = 'BILLED TO (BUYER DETAILS):';
    sheet.getCell('A5').font = { bold: true, size: 10, color: { argb: darkNavy } };

    sheet.mergeCells('A6:F6');
    sheet.getCell('A6').value = `${inv.business_name ? inv.business_name + ' (' + inv.customer_name + ')' : inv.customer_name}`;
    sheet.getCell('A6').font = { bold: true, size: 12, color: { argb: '0F172A' } };

    sheet.mergeCells('A7:F7');
    sheet.getCell('A7').value = `${inv.address || ''}${inv.city ? ', ' + inv.city : ''}${inv.state ? ', ' + inv.state : ''}`;
    sheet.getCell('A7').font = { size: 10, color: { argb: '475569' } };

    sheet.mergeCells('A8:F8');
    sheet.getCell('A8').value = `GSTIN: ${inv.gst_number || 'URP / Not Provided'} | Phone: ${inv.phone || 'N/A'}`;
    sheet.getCell('A8').font = { size: 10, color: { argb: '475569' } };

    // Right: Invoice Meta (G to K)
    const setMetaCell = (row: number, label: string, val: string) => {
      sheet.mergeCells(`G${row}:H${row}`);
      sheet.getCell(`G${row}`).value = label;
      sheet.getCell(`G${row}`).font = { bold: true, size: 10, color: { argb: darkNavy } };

      sheet.mergeCells(`I${row}:K${row}`);
      sheet.getCell(`I${row}`).value = val;
      sheet.getCell(`I${row}`).font = { size: 10, color: { argb: '0F172A' }, bold: label.includes('Invoice No') };
    };

    setMetaCell(5, 'Invoice No:', inv.invoice_number);
    setMetaCell(6, 'Invoice Date:', new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    setMetaCell(7, 'Place of Supply:', `${inv.state || 'Delhi'} (${inv.state_code || '07'})`);
    setMetaCell(8, 'Created By:', inv.created_by_username || 'Admin');

    // Row 9: Empty space
    sheet.getRow(9).height = 10;

    // Row 10: Table Headers
    const headers = [
      'S.No', 'Article No', 'Description', 'Sets', 'Pcs/Set', 'Total Qty',
      'Rate (₹)', 'Taxable (₹)', 'GST %', 'GST Amt (₹)', 'Total (₹)'
    ];
    const headerRow = sheet.getRow(10);
    headerRow.values = headers;
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = borderStyle;
    });

    // Items Rows
    let currentRowNum = 11;
    items.forEach((it: any, idx: number) => {
      const row = sheet.getRow(currentRowNum);
      row.values = [
        idx + 1,
        it.article_number,
        it.description || '-',
        it.sets,
        it.pieces_per_set,
        it.quantity,
        parseFloat(it.rate),
        parseFloat(it.taxable_amount),
        `${it.gst_rate}%`,
        parseFloat(it.gst_amount),
        parseFloat(it.total_amount),
      ];

      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.border = borderStyle;
        cell.font = { name: 'Calibri', size: 10 };
        // Column specific alignment
        if (colNumber === 1 || colNumber === 4 || colNumber === 5 || colNumber === 6 || colNumber === 9) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 2 || colNumber === 3) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0.00';
        }
      });

      // Highlight alternating rows
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGrayBg } };
        });
      }

      currentRowNum++;
    });

    // Subtotal Row
    const subtotalRow = sheet.getRow(currentRowNum);
    sheet.mergeCells(`A${currentRowNum}:C${currentRowNum}`);
    subtotalRow.getCell(1).value = 'TOTALS:';
    subtotalRow.getCell(1).font = { bold: true, size: 10 };
    subtotalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

    subtotalRow.getCell(4).value = inv.total_sets;
    subtotalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    subtotalRow.getCell(4).font = { bold: true };

    subtotalRow.getCell(5).value = '-';
    subtotalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

    subtotalRow.getCell(6).value = inv.total_pieces;
    subtotalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    subtotalRow.getCell(6).font = { bold: true };

    subtotalRow.getCell(7).value = '-';
    subtotalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    subtotalRow.getCell(8).value = parseFloat(inv.subtotal_taxable);
    subtotalRow.getCell(8).numFmt = '#,##0.00';
    subtotalRow.getCell(8).font = { bold: true };

    subtotalRow.getCell(9).value = '-';
    subtotalRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };

    subtotalRow.getCell(10).value = parseFloat(inv.total_gst_amount);
    subtotalRow.getCell(10).numFmt = '#,##0.00';
    subtotalRow.getCell(10).font = { bold: true };

    subtotalRow.getCell(11).value = parseFloat(inv.grand_total);
    subtotalRow.getCell(11).numFmt = '#,##0.00';
    subtotalRow.getCell(11).font = { bold: true };

    subtotalRow.height = 24;
    subtotalRow.eachCell(cell => {
      cell.border = borderStyle;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    });
    currentRowNum++;

    // Spacing
    currentRowNum++;

    // Summary Split (Left: Bank Details, Right: Tax Breakdown)
    const summaryStartRow = currentRowNum;

    // Left Side: Delivery Instructions & Notes (Replaced Bank Details)
    sheet.mergeCells(`A${summaryStartRow}:F${summaryStartRow}`);
    sheet.getCell(`A${summaryStartRow}`).value = 'DELIVERY INSTRUCTIONS & SPECIAL NOTES:';
    sheet.getCell(`A${summaryStartRow}`).font = { bold: true, size: 9.5, color: { argb: darkNavy } };

    const notesLines = (inv.notes || 'No special delivery instructions specified.').split('\n');
    notesLines.forEach((nl: string, nIdx: number) => {
      const nRow = summaryStartRow + 1 + nIdx;
      if (nRow < summaryStartRow + 5) {
        sheet.mergeCells(`A${nRow}:F${nRow}`);
        sheet.getCell(`A${nRow}`).value = nl;
        sheet.getCell(`A${nRow}`).font = { size: 9.5, italic: !inv.notes, color: { argb: '334155' } };
      }
    });

    // Right Side: Tax Summary
    const addSummaryLine = (r: number, label: string, val: number, isGrand = false) => {
      sheet.mergeCells(`H${r}:I${r}`);
      sheet.getCell(`H${r}`).value = label;
      sheet.getCell(`H${r}`).font = { bold: isGrand, size: isGrand ? 11 : 10, color: { argb: isGrand ? darkNavy : '475569' } };
      sheet.getCell(`H${r}`).alignment = { horizontal: 'right', vertical: 'middle' };

      sheet.mergeCells(`J${r}:K${r}`);
      sheet.getCell(`J${r}`).value = val;
      sheet.getCell(`J${r}`).numFmt = '#,##0.00';
      sheet.getCell(`J${r}`).font = { bold: isGrand, size: isGrand ? 12 : 10, color: { argb: isGrand ? '000000' : '0F172A' } };
      sheet.getCell(`J${r}`).alignment = { horizontal: 'right', vertical: 'middle' };

      if (isGrand) {
        sheet.getCell(`H${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
        sheet.getCell(`I${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
        sheet.getCell(`J${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
        sheet.getCell(`K${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
      }
    };

    addSummaryLine(summaryStartRow, 'Taxable Amount:', parseFloat(inv.subtotal_taxable));
    if (inv.is_interstate) {
      addSummaryLine(summaryStartRow + 1, 'IGST Amount:', parseFloat(inv.total_gst_amount));
    } else {
      const halfGst = Math.round((parseFloat(inv.total_gst_amount) / 2) * 100) / 100;
      addSummaryLine(summaryStartRow + 1, 'CGST Amount:', halfGst);
      addSummaryLine(summaryStartRow + 2, 'SGST Amount:', halfGst);
    }
    addSummaryLine(summaryStartRow + (inv.is_interstate ? 2 : 3), 'Round Off:', parseFloat(inv.round_off));
    addSummaryLine(summaryStartRow + (inv.is_interstate ? 3 : 4), 'GRAND TOTAL (INR):', parseFloat(inv.grand_total), true);

    // Terms & Conditions at bottom
    const termsRow = summaryStartRow + 6;
    sheet.mergeCells(`A${termsRow}:K${termsRow}`);
    sheet.getCell(`A${termsRow}`).value = 'TERMS & CONDITIONS:';
    sheet.getCell(`A${termsRow}`).font = { bold: true, size: 9, color: { argb: '64748B' } };

    const termsLines = (inv.terms_conditions || '').split('\n');
    termsLines.forEach((tl: string, tIdx: number) => {
      const tRow = termsRow + 1 + tIdx;
      sheet.mergeCells(`A${tRow}:K${tRow}`);
      sheet.getCell(`A${tRow}`).value = tl;
      sheet.getCell(`A${tRow}`).font = { size: 9, color: { argb: '64748B' } };
    });

    // Send workbook as stream
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Proforma_${inv.invoice_number}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating Excel for proforma:', err);
    res.status(500).json({ error: (err as any).message || 'Failed to generate Excel export' });
  }
});

export default router;
