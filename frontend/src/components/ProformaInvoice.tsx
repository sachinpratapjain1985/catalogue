import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, 
  Plus, 
  Search, 
  Printer, 
  FileSpreadsheet, 
  Trash2, 
  Edit3, 
  Copy, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Sparkles, 
  Phone, 
  MapPin, 
  Hash, 
  User, 
  ArrowLeft, 
  Save,
  X
} from 'lucide-react';

interface CatalogItem {
  id: number;
  sku_id: string;
  category_name: string;
  pieces_per_set: number;
  rate: number;
  revised_rate?: number | null;
  work?: string;
  material?: string;
  description?: string;
  image_path?: string;
  is_available?: boolean;
  sets_count?: number;
  total_pieces?: number;
}

interface ProformaLineItem {
  id?: number;
  item_id?: number | null;
  article_number: string;
  description: string;
  pieces_per_set: number;
  original_pieces_per_set?: number;
  is_manual_pcs?: boolean;
  sets: number;
  quantity: number;
  rate: number;
  original_rate?: number;
  is_manual_rate?: boolean;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  stock_status?: 'available' | 'out_of_stock' | 'inactive';
  available_sets?: number;
}

interface ProformaInvoiceData {
  id: number;
  invoice_number: string;
  invoice_date: string;
  valid_until?: string | null;
  customer_name: string;
  business_name?: string;
  city?: string;
  address?: string;
  gst_number?: string;
  phone?: string;
  state: string;
  state_code: string;
  company_name: string;
  company_brand: string;
  company_address: string;
  company_gst: string;
  company_phone: string;
  company_email: string;
  bank_name: string;
  bank_account_no: string;
  bank_ifsc: string;
  bank_branch: string;
  total_sets: number;
  total_pieces: number;
  subtotal_taxable: string | number;
  total_gst_5: string | number;
  total_gst_18: string | number;
  total_gst_amount: string | number;
  round_off: string | number;
  grand_total: string | number;
  is_interstate: boolean;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  notes?: string;
  terms_conditions?: string;
  created_by_username?: string;
  created_at: string;
  items?: ProformaLineItem[];
}

interface Props {
  token: string;
  user: {
    id: number;
    username: string;
    role: string;
  };
}

export default function ProformaInvoice({ token, user: _user }: Props) {
  // List state
  const [invoices, setInvoices] = useState<ProformaInvoiceData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Catalog items for autocomplete
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentInvoiceId, setCurrentInvoiceId] = useState<number | null>(null);

  // Form Fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'draft' | 'sent' | 'confirmed' | 'cancelled'>('draft');
  const [customerName, setCustomerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('Delhi');
  const [stateCode, setStateCode] = useState('07');
  const [isInterstate, setIsInterstate] = useState(false);
  const [notes, setNotes] = useState('');
  const [termsConditions, setTermsConditions] = useState(
    '1. Goods once sold will not be taken back or exchanged.\n2. Payment terms: 100% advance before dispatch.\n3. Subject to Delhi jurisdiction only.'
  );

  // Line items state
  const [lineItems, setLineItems] = useState<ProformaLineItem[]>([
    {
      article_number: '',
      description: '',
      pieces_per_set: 3,
      sets: 1,
      quantity: 3,
      rate: 0,
      taxable_amount: 0,
      gst_rate: 5,
      gst_amount: 0,
      total_amount: 0,
    }
  ]);

  // View / Print Modal state
  const [previewInvoice, setPreviewInvoice] = useState<ProformaInvoiceData | null>(null);

  // Manual edit popup alert state
  const [manualEditNotice, setManualEditNotice] = useState<{
    article: string;
    field: string;
    oldVal: number;
    newVal: number;
  } | null>(null);

  useEffect(() => {
    if (manualEditNotice) {
      const timer = setTimeout(() => {
        setManualEditNotice(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [manualEditNotice]);

  // Inactive / Out of stock warning modal state
  const [stockWarningModal, setStockWarningModal] = useState<{
    rowIndex: number;
    sku: string;
    status: 'inactive' | 'out_of_stock';
    setsCount: number;
    category: string;
    rate: number;
    pcsPerSet: number;
  } | null>(null);

  const handleRejectStockWarning = () => {
    if (!stockWarningModal) return;
    const { rowIndex, sku } = stockWarningModal;
    setLineItems(prev => {
      const updated = [...prev];
      if (updated[rowIndex]) {
        updated[rowIndex] = {
          ...updated[rowIndex],
          article_number: '',
          description: '',
          rate: 0,
          original_rate: 0,
          taxable_amount: 0,
          gst_amount: 0,
          total_amount: 0,
          stock_status: undefined,
          available_sets: undefined
        };
      }
      return updated;
    });
    showError(`Article "${sku}" was rejected and removed from line items.`);
    setStockWarningModal(null);
  };

  const handleContinueStockWarning = () => {
    if (!stockWarningModal) return;
    const { sku, status } = stockWarningModal;
    showSuccess(`Article "${sku}" added anyway (${status === 'inactive' ? 'Marked Inactive' : 'Out of Stock'}).`);
    setStockWarningModal(null);
  };

  // Load invoices on mount or filter change
  useEffect(() => {
    fetchInvoices();
  }, [page, search, statusFilter]);

  // Auto-scroll window to top whenever form or preview is opened
  useEffect(() => {
    if (isFormOpen || previewInvoice) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isFormOpen, previewInvoice]);

  // Load catalog items once for SKU autocomplete
  useEffect(() => {
    fetchCatalogItems();
  }, []);

  const fetchCatalogItems = async () => {
    try {
      const res = await fetch('/api/admin/items', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCatalogItems(data);
      }
    } catch (e) {
      console.error('Failed to load catalog items for autocomplete', e);
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        search: search.trim(),
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/proforma?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
        setTotalCount(data.total || 0);
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          window.location.reload();
          return;
        }
        setErrorMsg(err.error || 'Failed to fetch proforma invoices');
      }
    } catch (e) {
      setErrorMsg('Network error while fetching invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchNextInvoiceNumber = async () => {
    try {
      const res = await fetch('/api/admin/proforma/next-number', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.nextInvoiceNumber;
      }
    } catch (e) {
      console.error('Failed to fetch next number', e);
    }
    return '';
  };

  const handleOpenCreateModal = async () => {
    setIsEditing(false);
    setCurrentInvoiceId(null);
    const nextNum = await fetchNextInvoiceNumber();
    setInvoiceNumber(nextNum);
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setStatus('draft');
    setCustomerName('');
    setBusinessName('');
    setCity('');
    setAddress('');
    setGstNumber('');
    setPhone('');
    setState('Delhi');
    setStateCode('07');
    setIsInterstate(false);
    setNotes('');
    setTermsConditions(
      '1. Goods once sold will not be taken back or exchanged.\n2. Payment terms: 100% advance before dispatch.\n3. Subject to Delhi jurisdiction only.'
    );
    setLineItems([
      {
        article_number: '',
        description: '',
        pieces_per_set: 3,
        sets: 1,
        quantity: 3,
        rate: 0,
        taxable_amount: 0,
        gst_rate: 5,
        gst_amount: 0,
        total_amount: 0,
      }
    ]);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = async (inv: ProformaInvoiceData) => {
    try {
      const res = await fetch(`/api/admin/proforma/${inv.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const fullInv = await res.json();
        setIsEditing(true);
        setCurrentInvoiceId(fullInv.id);
        setInvoiceNumber(fullInv.invoice_number);
        setInvoiceDate(fullInv.invoice_date.slice(0, 10));
        setStatus(fullInv.status);
        setCustomerName(fullInv.customer_name);
        setBusinessName(fullInv.business_name || '');
        setCity(fullInv.city || '');
        setAddress(fullInv.address || '');
        setGstNumber(fullInv.gst_number || '');
        setPhone(fullInv.phone || '');
        setState(fullInv.state || 'Delhi');
        setStateCode(fullInv.state_code || '07');
        setIsInterstate(!!fullInv.is_interstate);
        setNotes(fullInv.notes || '');
        setTermsConditions(fullInv.terms_conditions || '');

        if (fullInv.items && fullInv.items.length > 0) {
          setLineItems(
            fullInv.items.map((it: any) => {
              const matchedCatalog = catalogItems.find(c => c.sku_id.toLowerCase() === (it.article_number || '').trim().toLowerCase());
              const defaultPcs = matchedCatalog ? (matchedCatalog.pieces_per_set || 3) : 3;
              const pcs = parseInt(it.pieces_per_set) || 1;
              const defaultRate = matchedCatalog ? ((matchedCatalog.revised_rate && matchedCatalog.revised_rate > 0) ? matchedCatalog.revised_rate : matchedCatalog.rate) : 0;
              const rt = parseFloat(it.rate) || 0;
              const isInactive = matchedCatalog ? matchedCatalog.is_available === false : false;
              const isOutOfStock = matchedCatalog ? (matchedCatalog.is_available !== false && ((matchedCatalog.sets_count ?? 0) <= 0)) : false;
              const stockStatus: 'available' | 'out_of_stock' | 'inactive' | undefined = matchedCatalog
                ? (isInactive ? 'inactive' : isOutOfStock ? 'out_of_stock' : 'available')
                : undefined;
              const availSets = matchedCatalog ? (matchedCatalog.sets_count ?? 0) : undefined;
              return {
                id: it.id,
                item_id: it.item_id,
                article_number: it.article_number,
                description: it.description || '',
                pieces_per_set: pcs,
                original_pieces_per_set: defaultPcs,
                is_manual_pcs: pcs !== defaultPcs,
                sets: parseInt(it.sets) || 1,
                quantity: parseInt(it.quantity) || 1,
                rate: rt,
                original_rate: defaultRate,
                is_manual_rate: defaultRate > 0 && rt !== defaultRate,
                taxable_amount: parseFloat(it.taxable_amount) || 0,
                gst_rate: parseFloat(it.gst_rate) || 5,
                gst_amount: parseFloat(it.gst_amount) || 0,
                total_amount: parseFloat(it.total_amount) || 0,
                stock_status: stockStatus,
                available_sets: availSets,
              };
            })
          );
        } else {
          setLineItems([]);
        }
        setIsFormOpen(true);
      }
    } catch (e) {
      showError('Failed to load invoice for editing');
    }
  };

  const handleDuplicate = async (inv: ProformaInvoiceData) => {
    try {
      const res = await fetch(`/api/admin/proforma/${inv.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const fullInv = await res.json();
        setIsEditing(false);
        setCurrentInvoiceId(null);
        const nextNum = await fetchNextInvoiceNumber();
        setInvoiceNumber(nextNum);
        setInvoiceDate(new Date().toISOString().slice(0, 10));
        setStatus('draft');
        setCustomerName(fullInv.customer_name);
        setBusinessName(fullInv.business_name || '');
        setCity(fullInv.city || '');
        setAddress(fullInv.address || '');
        setGstNumber(fullInv.gst_number || '');
        setPhone(fullInv.phone || '');
        setState(fullInv.state || 'Delhi');
        setStateCode(fullInv.state_code || '07');
        setIsInterstate(!!fullInv.is_interstate);
        setNotes(fullInv.notes || '');
        setTermsConditions(fullInv.terms_conditions || '');

        if (fullInv.items && fullInv.items.length > 0) {
          setLineItems(
            fullInv.items.map((it: any) => {
              const matchedCatalog = catalogItems.find(c => c.sku_id.toLowerCase() === (it.article_number || '').trim().toLowerCase());
              const defaultPcs = matchedCatalog ? (matchedCatalog.pieces_per_set || 3) : 3;
              const pcs = parseInt(it.pieces_per_set) || 1;
              const defaultRate = matchedCatalog ? ((matchedCatalog.revised_rate && matchedCatalog.revised_rate > 0) ? matchedCatalog.revised_rate : matchedCatalog.rate) : 0;
              const rt = parseFloat(it.rate) || 0;
              const isInactive = matchedCatalog ? matchedCatalog.is_available === false : false;
              const isOutOfStock = matchedCatalog ? (matchedCatalog.is_available !== false && ((matchedCatalog.sets_count ?? 0) <= 0)) : false;
              const stockStatus: 'available' | 'out_of_stock' | 'inactive' | undefined = matchedCatalog
                ? (isInactive ? 'inactive' : isOutOfStock ? 'out_of_stock' : 'available')
                : undefined;
              const availSets = matchedCatalog ? (matchedCatalog.sets_count ?? 0) : undefined;
              return {
                item_id: it.item_id,
                article_number: it.article_number,
                description: it.description || '',
                pieces_per_set: pcs,
                original_pieces_per_set: defaultPcs,
                is_manual_pcs: pcs !== defaultPcs,
                sets: parseInt(it.sets) || 1,
                quantity: parseInt(it.quantity) || 1,
                rate: rt,
                original_rate: defaultRate,
                is_manual_rate: defaultRate > 0 && rt !== defaultRate,
                taxable_amount: parseFloat(it.taxable_amount) || 0,
                gst_rate: parseFloat(it.gst_rate) || 5,
                gst_amount: parseFloat(it.gst_amount) || 0,
                total_amount: parseFloat(it.total_amount) || 0,
                stock_status: stockStatus,
                available_sets: availSets,
              };
            })
          );
        }
        setIsFormOpen(true);
        showSuccess('Invoice duplicated as new draft');
      }
    } catch (e) {
      showError('Failed to duplicate invoice');
    }
  };

  const handleDelete = async (inv: ProformaInvoiceData) => {
    if (!window.confirm(`Are you sure you want to delete Proforma Invoice "${inv.invoice_number}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/proforma/${inv.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showSuccess(`Invoice ${inv.invoice_number} deleted successfully`);
        fetchInvoices();
      } else {
        const err = await res.json();
        showError(err.error || 'Failed to delete invoice');
      }
    } catch (e) {
      showError('Network error while deleting');
    }
  };

  const handlePreview = async (inv: ProformaInvoiceData) => {
    try {
      const res = await fetch(`/api/admin/proforma/${inv.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewInvoice(data);
      }
    } catch (e) {
      showError('Failed to load invoice preview');
    }
  };

  // Line item manipulation & Indian Garment GST rule calculation
  const updateLineItem = (index: number, field: keyof ProformaLineItem, val: any) => {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: val };

      // If updating catalog item selection
      if (field === 'article_number') {
        const found = catalogItems.find(c => c.sku_id.toLowerCase() === val.toString().trim().toLowerCase());
        if (found) {
          item.item_id = found.id;
          const defaultPcs = found.pieces_per_set || 3;
          item.pieces_per_set = defaultPcs;
          item.original_pieces_per_set = defaultPcs;
          item.is_manual_pcs = false;

          const chosenRate = found.revised_rate && found.revised_rate > 0 ? found.revised_rate : found.rate;
          item.rate = chosenRate || 0;
          item.original_rate = chosenRate || 0;
          item.is_manual_rate = false;

          item.description = found.work ? `${found.work} ${found.material ? '• ' + found.material : ''}` : (found.description || '');
          // Garment GST Rule: <= 2500 is 5%, > 2500 is 18%
          item.gst_rate = item.rate <= 2500 ? 5 : 18;

          // Check stock availability & inactive status
          const isInactive = found.is_available === false;
          const isOutOfStock = found.is_available !== false && ((found.sets_count ?? 0) <= 0);

          if (isInactive) {
            item.stock_status = 'inactive';
            item.available_sets = found.sets_count ?? 0;
            setStockWarningModal({
              rowIndex: index,
              sku: found.sku_id,
              status: 'inactive',
              setsCount: found.sets_count ?? 0,
              category: found.category_name || '',
              rate: chosenRate || 0,
              pcsPerSet: defaultPcs
            });
          } else if (isOutOfStock) {
            item.stock_status = 'out_of_stock';
            item.available_sets = found.sets_count ?? 0;
            setStockWarningModal({
              rowIndex: index,
              sku: found.sku_id,
              status: 'out_of_stock',
              setsCount: found.sets_count ?? 0,
              category: found.category_name || '',
              rate: chosenRate || 0,
              pcsPerSet: defaultPcs
            });
          } else {
            item.stock_status = 'available';
            item.available_sets = found.sets_count ?? 0;
          }
        } else {
          item.stock_status = undefined;
          item.available_sets = undefined;
        }
      }

      // If user edits pieces_per_set manually
      if (field === 'pieces_per_set') {
        const newPcs = Math.max(1, parseInt(val) || 1);
        item.pieces_per_set = newPcs;
        const origPcs = item.original_pieces_per_set !== undefined ? item.original_pieces_per_set : 3;
        if (newPcs !== origPcs) {
          item.is_manual_pcs = true;
          setManualEditNotice({
            article: item.article_number || `Item #${index + 1}`,
            field: 'Pieces per Set',
            oldVal: origPcs,
            newVal: newPcs
          });
        } else {
          item.is_manual_pcs = false;
        }
      }

      // If rate changed and gst_rate wasn't manually overridden, auto-recalculate GST slab
      if (field === 'rate') {
        const numRate = parseFloat(val) || 0;
        item.rate = numRate;
        item.gst_rate = numRate <= 2500 ? 5 : 18;
        if (item.original_rate !== undefined && item.original_rate > 0 && numRate !== item.original_rate) {
          item.is_manual_rate = true;
          setManualEditNotice({
            article: item.article_number || `Item #${index + 1}`,
            field: 'Rate (₹/pc)',
            oldVal: item.original_rate,
            newVal: numRate
          });
        } else if (item.original_rate !== undefined && numRate === item.original_rate) {
          item.is_manual_rate = false;
        }
      }

      // Quantity calculation: sets * pieces_per_set
      const piecesPerSet = Math.max(1, parseInt(item.pieces_per_set as any) || 1);
      const sets = Math.max(0, parseInt(item.sets as any) || 0);
      item.pieces_per_set = piecesPerSet;
      item.sets = sets;
      item.quantity = sets * piecesPerSet;

      // Taxable amount: quantity * rate
      item.taxable_amount = Math.round(item.quantity * (item.rate || 0) * 100) / 100;

      // GST amount: taxable_amount * (gst_rate / 100)
      const gRate = parseFloat(item.gst_rate as any) || 5;
      item.gst_rate = gRate;
      item.gst_amount = Math.round((item.taxable_amount * (gRate / 100)) * 100) / 100;

      // Total amount: taxable + gst
      item.total_amount = Math.round((item.taxable_amount + item.gst_amount) * 100) / 100;

      updated[index] = item;
      return updated;
    });
  };

  const addLineItem = (isCatalog: boolean = true) => {
    setLineItems(prev => [
      ...prev,
      {
        article_number: isCatalog ? '' : 'MANUAL',
        description: '',
        pieces_per_set: isCatalog ? 3 : 1,
        sets: 1,
        quantity: isCatalog ? 3 : 1,
        rate: 0,
        taxable_amount: 0,
        gst_rate: 5,
        gst_amount: 0,
        total_amount: 0,
      }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) {
      showError('Invoice must have at least one line item');
      return;
    }
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  // Computed summary
  const summary = useMemo(() => {
    let sets = 0;
    let pieces = 0;
    let taxable = 0;
    let gst5 = 0;
    let gst18 = 0;

    lineItems.forEach(it => {
      sets += it.sets || 0;
      pieces += it.quantity || 0;
      taxable += it.taxable_amount || 0;
      if (it.gst_rate === 5) {
        gst5 += it.gst_amount || 0;
      } else {
        gst18 += it.gst_amount || 0;
      }
    });

    taxable = Math.round(taxable * 100) / 100;
    gst5 = Math.round(gst5 * 100) / 100;
    gst18 = Math.round(gst18 * 100) / 100;
    const totalGst = Math.round((gst5 + gst18) * 100) / 100;
    const unrounded = taxable + totalGst;
    const grand = Math.round(unrounded);
    const roundOff = Math.round((grand - unrounded) * 100) / 100;

    return {
      totalSets: sets,
      totalPieces: pieces,
      taxable,
      gst5,
      gst18,
      totalGst,
      roundOff,
      grandTotal: grand,
    };
  }, [lineItems]);

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      showError('Please enter Customer Name');
      return;
    }

    if (lineItems.length === 0 || lineItems.some(it => !it.article_number.trim())) {
      showError('All items must have an Article / SKU number');
      return;
    }

    const payload = {
      invoiceNumber,
      invoiceDate,
      status,
      customerName: customerName.trim(),
      businessName: businessName.trim(),
      city: city.trim(),
      address: address.trim(),
      gstNumber: gstNumber.trim().toUpperCase(),
      phone: phone.trim(),
      state: state.trim(),
      stateCode: stateCode.trim(),
      isInterstate,
      notes: notes.trim(),
      termsConditions: termsConditions.trim(),
      items: lineItems.map(it => ({
        itemId: it.item_id || null,
        articleNumber: it.article_number.trim(),
        description: it.description || '',
        piecesPerSet: it.pieces_per_set,
        sets: it.sets,
        quantity: it.quantity,
        rate: it.rate,
        gstRate: it.gst_rate,
      }))
    };

    try {
      const url = isEditing && currentInvoiceId ? `/api/admin/proforma/${currentInvoiceId}` : '/api/admin/proforma';
      const method = isEditing && currentInvoiceId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showSuccess(isEditing ? 'Invoice updated successfully' : 'Proforma Invoice created successfully');
        setIsFormOpen(false);
        fetchInvoices();
      } else {
        const err = await res.json();
        showError(err.error || 'Failed to save invoice');
      }
    } catch (e) {
      showError('Network error while saving invoice');
    }
  };

  const handleDownloadExcel = (invoiceId: number, invNumber: string) => {
    const downloadUrl = `/api/admin/proforma/${invoiceId}/excel?token=${token}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Proforma_${invNumber}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  // Prevent background scrolling when either modal is open
  useEffect(() => {
    if (isFormOpen || previewInvoice) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFormOpen, previewInvoice]);

  // Support closing modals with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewInvoice) {
          setPreviewInvoice(null);
        } else if (isFormOpen) {
          setIsFormOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewInvoice, isFormOpen]);

  const renderCreateEditModal = () => {
    if (!isFormOpen) return null;

    return createPortal(
      <div 
        className="proforma-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem',
          overflow: 'hidden'
        }}
      >
        <div 
          className="fade-in"
          style={{
            width: '95vw',
            maxWidth: '1380px',
            height: '92vh',
            maxHeight: '92vh',
            background: 'var(--bg-card, #131722)',
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
            borderRadius: '16px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.75)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Manual Edit Floating Alert Popup */}
          {manualEditNotice && (
            <div 
              className="fade-in"
              style={{
                position: 'absolute',
                top: '75px',
                right: '30px',
                zIndex: 100005,
                background: '#1e2433',
                border: '2px solid #f59e0b',
                borderRadius: '12px',
                padding: '1.2rem 1.4rem',
                boxShadow: '0 20px 45px rgba(0, 0, 0, 0.75)',
                maxWidth: '430px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b', fontWeight: 700, fontSize: '1rem' }}>
                  <AlertCircle size={20} />
                  <span>Manual Editing Notice</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setManualEditNotice(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                You are manually editing <strong>{manualEditNotice.field}</strong> for article <strong style={{ color: '#38bdf8' }}>{manualEditNotice.article}</strong>:
                <div style={{ margin: '0.5rem 0', padding: '0.5rem 0.8rem', background: 'rgba(245, 158, 11, 0.12)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Original: <strong>{manualEditNotice.oldVal}</strong></span>
                  <span style={{ color: '#f59e0b', fontWeight: 800 }}>➔ Manual: {manualEditNotice.newVal}</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Total quantity & line amounts recalculated automatically.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                <button 
                  type="button" 
                  onClick={() => setManualEditNotice(null)} 
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 1.1rem', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  Confirm / OK
                </button>
              </div>
            </div>
          )}

          {/* Stock Availability / Inactive Warning Confirmation Dialog */}
          {stockWarningModal && (
            <div
              className="fade-in"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.82)',
                backdropFilter: 'blur(8px)',
                zIndex: 100010,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  background: '#161c2b',
                  border: `2px solid ${stockWarningModal.status === 'inactive' ? '#ef4444' : '#f59e0b'}`,
                  borderRadius: '16px',
                  padding: '2rem',
                  maxWidth: '540px',
                  width: '100%',
                  boxShadow: '0 30px 70px rgba(0, 0, 0, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: stockWarningModal.status === 'inactive' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <AlertCircle size={30} color={stockWarningModal.status === 'inactive' ? '#ef4444' : '#f59e0b'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: stockWarningModal.status === 'inactive' ? '#f87171' : '#fbbf24'
                    }}>
                      {stockWarningModal.status === 'inactive' 
                        ? 'Article is Marked Inactive!' 
                        : 'Article is Out of Stock!'}
                    </h3>
                    <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                      {stockWarningModal.status === 'inactive'
                        ? 'This design is currently disabled/inactive in the wholesale catalog.'
                        : 'This design has 0 sets available in current factory inventory.'}
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                  fontSize: '0.9rem'
                }}>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>Article / SKU</span>
                    <strong style={{ color: '#ffffff', fontSize: '1.1rem', fontFamily: 'Outfit' }}>{stockWarningModal.sku}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>Category</span>
                    <strong style={{ color: '#ffffff' }}>{stockWarningModal.category || 'Garments'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>Catalog Rate</span>
                    <strong style={{ color: '#38bdf8' }}>₹{stockWarningModal.rate} / pc</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'block' }}>Stock Status</span>
                    <span style={{
                      display: 'inline-block',
                      fontWeight: 800,
                      color: stockWarningModal.status === 'inactive' ? '#ef4444' : '#f59e0b',
                      textTransform: 'uppercase',
                      fontSize: '0.85rem'
                    }}>
                      {stockWarningModal.status === 'inactive' ? '🚫 Inactive' : '⚠️ 0 Sets Left'}
                    </span>
                  </div>
                </div>

                <div style={{
                  background: stockWarningModal.status === 'inactive' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  borderLeft: `4px solid ${stockWarningModal.status === 'inactive' ? '#ef4444' : '#f59e0b'}`,
                  padding: '0.8rem 1rem',
                  borderRadius: '0 8px 8px 0',
                  fontSize: '0.88rem',
                  color: '#e2e8f0',
                  lineHeight: 1.4
                }}>
                  It is your choice to continue adding this item to the proforma or reject/remove it.
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '1rem',
                  marginTop: '0.5rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <button
                    type="button"
                    onClick={handleRejectStockWarning}
                    className="btn btn-secondary"
                    style={{
                      borderColor: '#ef4444',
                      color: '#f87171',
                      padding: '0.65rem 1.3rem',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <Trash2 size={16} />
                    <span>Reject / Remove</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueStockWarning}
                    className="btn btn-primary"
                    style={{
                      background: stockWarningModal.status === 'inactive' ? '#ef4444' : '#f59e0b',
                      borderColor: stockWarningModal.status === 'inactive' ? '#ef4444' : '#f59e0b',
                      color: '#000000',
                      padding: '0.65rem 1.4rem',
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Continue Anyway</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pinned Modal Header */}
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-secondary)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText size={22} color="var(--color-primary)" />
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>
                  {isEditing ? `Edit Proforma Invoice: ${invoiceNumber}` : 'Create New Proforma Invoice'}
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Enter buyer details & article numbers. Rate and GST are calculated automatically.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: 'var(--bg-card)',
                padding: '0.4rem 0.9rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)',
                fontSize: '0.85rem'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total: <strong style={{ color: 'var(--text-primary)' }}>{summary.totalSets} Sets ({summary.totalPieces} Pcs)</strong></span>
                <span style={{ color: 'var(--glass-border)' }}>|</span>
                <span style={{ color: 'var(--text-secondary)' }}>Grand Total: <strong style={{ color: 'var(--color-success)', fontFamily: 'Outfit' }}>₹{summary.grandTotal.toLocaleString('en-IN')}</strong></span>
              </div>

              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="btn btn-secondary"
                style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Form with Scrollable Body and Pinned Footer */}
          <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Notifications */}
              {errorMsg && (
                <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--color-danger)', padding: '0.9rem 1.2rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={18} />
                  <span>{errorMsg}</span>
                </div>
              )}
          
          {/* Row 1: Invoice Meta */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--color-primary)', fontSize: '1rem', fontWeight: 600 }}>
              <FileText size={18} />
              Invoice Configuration & Tax Mode
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Invoice Number *</label>
                <input 
                  type="text" 
                  value={invoiceNumber} 
                  onChange={e => setInvoiceNumber(e.target.value)} 
                  required 
                  style={{ fontFamily: 'Outfit', fontWeight: 600, padding: '0.75rem 1rem', fontSize: '1rem' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Invoice Date *</label>
                <input 
                  type="date" 
                  value={invoiceDate} 
                  onChange={e => setInvoiceDate(e.target.value)} 
                  required 
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select 
                  value={status} 
                  onChange={e => setStatus(e.target.value as any)}
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem' }}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent to Buyer</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Tax Application</label>
                <select 
                  value={isInterstate ? 'interstate' : 'intrastate'} 
                  onChange={e => setIsInterstate(e.target.value === 'interstate')}
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem' }}
                >
                  <option value="intrastate">Delhi Intra-state (CGST + SGST)</option>
                  <option value="interstate">Out of Delhi Inter-state (IGST)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Buyer & Customer Information */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, color: 'var(--color-primary)', fontSize: '1.05rem', fontWeight: 600 }}>
                <Building2 size={20} />
                Buyer & Customer Information
              </h4>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                All fields printed on Proforma Invoice & Export Excel
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Customer Name */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                  <User size={15} color="#818cf8" /> Customer Name *
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Ramesh Kumar / Boutique Owner" 
                  value={customerName} 
                  onChange={e => setCustomerName(e.target.value)} 
                  required 
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', fontWeight: 500 }}
                />
              </div>

              {/* Customer Phone / WhatsApp */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                  <Phone size={15} color="#34d399" /> Customer Phone / WhatsApp Number *
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ 
                    position: 'absolute', 
                    left: '0.9rem', 
                    fontSize: '0.9rem', 
                    fontWeight: 600, 
                    color: 'var(--text-secondary)',
                    pointerEvents: 'none' 
                  }}>
                    +91
                  </span>
                  <input 
                    type="tel" 
                    placeholder="98765 43210" 
                    value={phone.startsWith('+91 ') ? phone.slice(4) : phone.startsWith('+91') ? phone.slice(3) : phone} 
                    onChange={e => {
                      const val = e.target.value.trim();
                      setPhone(val ? (val.startsWith('+') ? val : `+91 ${val}`) : '');
                    }} 
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem 1rem 0.75rem 3.4rem', 
                      fontSize: '0.95rem', 
                      fontWeight: 500,
                      letterSpacing: '0.02em'
                    }}
                  />
                </div>
              </div>

              {/* Business Name */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Building2 size={15} color="#cbd5e1" /> Business / Firm / Boutique Name
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Raj Garments & Co." 
                  value={businessName} 
                  onChange={e => setBusinessName(e.target.value)} 
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem' }}
                />
              </div>

              {/* GSTIN */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Hash size={15} color="#cbd5e1" /> GST Number (GSTIN)
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. 07AAAAA0000A1Z5" 
                  value={gstNumber} 
                  onChange={e => setGstNumber(e.target.value.toUpperCase())} 
                  style={{ textTransform: 'uppercase', fontFamily: 'monospace', padding: '0.75rem 1rem', fontSize: '0.95rem', letterSpacing: '0.05em' }}
                />
              </div>

              {/* City */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={15} color="#cbd5e1" /> City / Destination
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Surat, Jaipur, Mumbai, Delhi" 
                  value={city} 
                  onChange={e => setCity(e.target.value)} 
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem' }}
                />
              </div>

              {/* Full Address */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <MapPin size={15} color="#cbd5e1" /> Full Billing / Shipping Address
                </label>
                <input 
                  type="text" 
                  placeholder="Shop / Unit No, Road, Market / Complex, Pin Code" 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  style={{ padding: '0.75rem 1rem', fontSize: '0.95rem' }}
                />
              </div>
            </div>
          </div>

          {/* Row 3: Items Grid (Spacious full page table!) */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div className="flex-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                  <Sparkles size={18} color="#d97706" />
                  Quotation Line Items & Garments
                </h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Add catalog SKUs or custom manual articles. Rate and 5% / 18% GST are calculated automatically.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button 
                  type="button" 
                  onClick={() => addLineItem(true)} 
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  <Plus size={15} /> Add Catalog SKU
                </button>
                <button 
                  type="button" 
                  onClick={() => addLineItem(false)} 
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  <Plus size={15} /> Add Manual Item (Palazzo / Suit)
                </button>
              </div>
            </div>

            <div 
              className="table-container proforma-table" 
              style={{ 
                overflowX: 'auto', 
                maxHeight: '480px', 
                overflowY: 'auto',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                background: 'rgba(15, 23, 42, 0.4)'
              }}
            >
              <table style={{ width: '100%', minWidth: '1320px', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#181f2f', borderBottom: '2px solid rgba(255, 255, 255, 0.15)' }}>
                    <th style={{ width: '45px', textAlign: 'center', padding: '12px 8px', color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>#</th>
                    <th style={{ width: '190px', minWidth: '180px', textAlign: 'left', padding: '12px 10px', color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Article / SKU No *</th>
                    <th style={{ width: '200px', minWidth: '180px', textAlign: 'left', padding: '12px 10px', color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Description / Work</th>
                    <th style={{ width: '100px', minWidth: '95px', textAlign: 'center', padding: '12px 8px', color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Sets</th>
                    <th style={{ width: '120px', minWidth: '110px', textAlign: 'center', padding: '12px 8px', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Pcs / Set</th>
                    <th style={{ width: '110px', minWidth: '100px', textAlign: 'center', padding: '12px 8px', color: '#38bdf8', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Total Qty</th>
                    <th style={{ width: '140px', minWidth: '130px', textAlign: 'right', padding: '12px 10px', color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Rate (₹/pc)</th>
                    <th style={{ width: '135px', minWidth: '125px', textAlign: 'right', padding: '12px 10px', color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>Taxable (₹)</th>
                    <th style={{ width: '100px', minWidth: '95px', textAlign: 'center', padding: '12px 8px', color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>GST %</th>
                    <th style={{ width: '120px', minWidth: '110px', textAlign: 'right', padding: '12px 10px', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', background: '#181f2f' }}>GST Amt (₹)</th>
                    <th style={{ width: '140px', minWidth: '130px', textAlign: 'right', padding: '12px 10px', color: 'var(--color-success)', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', background: '#181f2f' }}>Total (₹)</th>
                    <th style={{ width: '50px', textAlign: 'center', padding: '12px 6px', background: '#181f2f' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: index % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent' }}>
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 600, padding: '10px 6px' }}>{index + 1}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ position: 'relative' }}>
                          <input 
                            type="text" 
                            list={`sku-list-${index}`}
                            placeholder="Type or pick SKU..." 
                            value={item.article_number} 
                            onChange={e => updateLineItem(index, 'article_number', e.target.value)}
                            style={{ 
                              width: '100%', 
                              padding: '0.65rem 0.8rem', 
                              fontSize: '0.95rem', 
                              fontFamily: 'Outfit', 
                              fontWeight: 600,
                              background: item.stock_status === 'inactive'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : item.stock_status === 'out_of_stock'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'rgba(255, 255, 255, 0.08)',
                              border: item.stock_status === 'inactive'
                                ? '1.5px solid #ef4444'
                                : item.stock_status === 'out_of_stock'
                                  ? '1.5px solid #f59e0b'
                                  : '1.5px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '6px',
                              color: item.stock_status === 'inactive'
                                ? '#fca5a5'
                                : item.stock_status === 'out_of_stock'
                                  ? '#fcd34d'
                                  : '#ffffff'
                            }}
                            required
                          />
                          <datalist id={`sku-list-${index}`}>
                            {catalogItems.map(c => {
                              const isInactive = c.is_available === false;
                              const isOutOfStock = c.is_available !== false && ((c.sets_count ?? 0) <= 0);
                              const tag = isInactive 
                                ? '[🚫 INACTIVE]' 
                                : isOutOfStock 
                                  ? '[⚠️ OUT OF STOCK]' 
                                  : `[Stock: ${c.sets_count ?? 0} sets]`;
                              return (
                                <option key={c.id} value={c.sku_id}>
                                  {c.sku_id} • {tag} • {c.category_name} ({c.pieces_per_set} pcs/set @ ₹{c.revised_rate || c.rate})
                                </option>
                              );
                            })}
                          </datalist>

                          {/* Status Indicator Badges below SKU input */}
                          {item.stock_status === 'inactive' && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              background: 'rgba(239, 68, 68, 0.25)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.5)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              marginTop: '4px',
                              fontWeight: 700
                            }}>
                              🚫 Inactive Article
                            </div>
                          )}
                          {item.stock_status === 'out_of_stock' && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              background: 'rgba(245, 158, 11, 0.25)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.5)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              marginTop: '4px',
                              fontWeight: 700
                            }}>
                              ⚠️ Out of Stock (0 Sets)
                            </div>
                          )}
                          {item.stock_status === 'available' && item.available_sets !== undefined && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.7rem',
                              color: '#34d399',
                              marginTop: '3px',
                              fontWeight: 600
                            }}>
                              ✓ Stock: {item.available_sets} sets
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <input 
                          type="text" 
                          placeholder="e.g. Mirror Work, Palazzo" 
                          value={item.description} 
                          onChange={e => updateLineItem(index, 'description', e.target.value)}
                          style={{ 
                            width: '100%', 
                            padding: '0.65rem 0.8rem', 
                            fontSize: '0.9rem',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1.5px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: '#ffffff'
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <input 
                          type="number" 
                          min="1" 
                          value={item.sets} 
                          title="Enter number of sets"
                          onChange={e => updateLineItem(index, 'sets', parseInt(e.target.value) || 1)}
                          style={{ 
                            width: '100%', 
                            padding: '0.65rem 0.5rem', 
                            textAlign: 'center', 
                            fontSize: '1.05rem', 
                            fontWeight: 700, 
                            fontFamily: 'Outfit',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1.5px solid rgba(255, 255, 255, 0.25)',
                            borderRadius: '6px',
                            color: '#ffffff'
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                          <input 
                            type="number" 
                            min="1" 
                            value={item.pieces_per_set} 
                            title="Pieces per set (can be modified manually)"
                            onChange={e => updateLineItem(index, 'pieces_per_set', parseInt(e.target.value) || 1)}
                            style={{ 
                              width: '100%', 
                              padding: '0.65rem 0.5rem', 
                              textAlign: 'center', 
                              fontSize: '1.05rem', 
                              fontWeight: 700, 
                              fontFamily: 'Outfit',
                              background: item.is_manual_pcs ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                              border: item.is_manual_pcs ? '2px solid #f59e0b' : '1.5px solid rgba(255, 255, 255, 0.25)',
                              borderRadius: '6px',
                              color: item.is_manual_pcs ? '#fcd34d' : '#ffffff'
                            }}
                          />
                          {item.is_manual_pcs && (
                            <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              ✏️ Manual Set
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          padding: '0.45rem 0.4rem',
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: '6px'
                        }}>
                          <span style={{ fontWeight: 800, fontFamily: 'Outfit', fontSize: '1.1rem', color: '#38bdf8' }}>
                            {item.quantity}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {item.sets} × {item.pieces_per_set} pcs
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: '10px', color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600, pointerEvents: 'none' }}>
                            ₹
                          </span>
                          <input 
                            type="number" 
                            min="0" 
                            step="any"
                            value={item.rate || ''} 
                            placeholder="0.00"
                            onChange={e => updateLineItem(index, 'rate', parseFloat(e.target.value) || 0)}
                            style={{ 
                              width: '100%', 
                              padding: '0.65rem 0.6rem 0.65rem 1.6rem', 
                              textAlign: 'right', 
                              fontSize: '1rem', 
                              fontWeight: 700, 
                              fontFamily: 'monospace',
                              background: item.is_manual_rate ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                              border: item.is_manual_rate ? '2px solid #f59e0b' : '1.5px solid rgba(255, 255, 255, 0.25)',
                              borderRadius: '6px',
                              color: item.is_manual_rate ? '#fcd34d' : '#ffffff'
                            }}
                          />
                        </div>
                        {item.is_manual_rate && (
                          <div style={{ textAlign: 'right', marginTop: '2px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
                              ✏️ Manual Rate
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', padding: '10px 8px' }}>
                        ₹{item.taxable_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <select 
                          value={item.gst_rate} 
                          onChange={e => updateLineItem(index, 'gst_rate', parseFloat(e.target.value))}
                          style={{ 
                            width: '100%', 
                            padding: '0.65rem 0.4rem', 
                            fontSize: '0.9rem', 
                            fontWeight: 700,
                            textAlign: 'center',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1.5px solid rgba(255, 255, 255, 0.25)',
                            borderRadius: '6px',
                            color: '#ffffff'
                          }}
                        >
                          <option value="5">5%</option>
                          <option value="18">18%</option>
                          <option value="12">12%</option>
                          <option value="0">0%</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.95rem', color: '#f59e0b', fontWeight: 700, padding: '10px 8px' }}>
                        ₹{item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'Outfit', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-success)', padding: '10px 8px' }}>
                        ₹{item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 6px' }}>
                        <button 
                          type="button" 
                          onClick={() => removeLineItem(index)} 
                          style={{ 
                            border: 'none', 
                            background: 'rgba(244, 63, 94, 0.12)', 
                            color: 'var(--color-danger)', 
                            cursor: 'pointer', 
                            padding: '8px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                          }}
                          title="Remove item"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                onClick={() => addLineItem(true)} 
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                <Plus size={15} /> Add Another Article
              </button>
            </div>
          </div>

          {/* Row 4: 2-Column Split: Notes/Terms & Financial Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontWeight: 600 }}>Delivery Instructions & Special Notes</label>
                <textarea 
                  rows={3} 
                  placeholder="e.g. Transport through V-Trans, packing in plastic sacks, dispatch by Friday..." 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  style={{ width: '100%', fontSize: '0.9rem' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Printed prominently on the final Proforma Invoice and exported Excel.
                </span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontWeight: 600 }}>Terms & Conditions</label>
                <textarea 
                  rows={4} 
                  value={termsConditions} 
                  onChange={e => setTermsConditions(e.target.value)} 
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Calculation Summary Card */}
            <div className="glass-card" style={{ padding: '1.5rem', background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h4 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.6rem', margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                Invoice Summary Breakdown
              </h4>
              
              <div className="flex-between" style={{ fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Sets:</span>
                <strong>{summary.totalSets} Sets</strong>
              </div>
              <div className="flex-between" style={{ fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Garment Pieces:</span>
                <strong>{summary.totalPieces} Pieces</strong>
              </div>
              <div className="flex-between" style={{ fontSize: '0.95rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal (Taxable Value):</span>
                <span style={{ fontFamily: 'monospace' }}>₹{summary.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>

              {summary.gst5 > 0 && (
                <div className="flex-between" style={{ fontSize: '0.9rem', color: '#f59e0b' }}>
                  <span>GST @ 5% (Items &le; ₹2,500):</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{summary.gst5.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              {summary.gst18 > 0 && (
                <div className="flex-between" style={{ fontSize: '0.9rem', color: '#f59e0b' }}>
                  <span>GST @ 18% (Items &gt; ₹2,500):</span>
                  <span style={{ fontFamily: 'monospace' }}>₹{summary.gst18.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex-between" style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>
                <span>{isInterstate ? 'Total IGST (Interstate):' : 'Total CGST + SGST (Delhi):'}</span>
                <strong style={{ fontFamily: 'monospace' }}>₹{summary.totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </div>

              {summary.roundOff !== 0 && (
                <div className="flex-between" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span>Round Off:</span>
                  <span style={{ fontFamily: 'monospace' }}>{summary.roundOff > 0 ? `+₹${summary.roundOff}` : `-₹${Math.abs(summary.roundOff)}`}</span>
                </div>
              )}

              <div className="flex-between" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.85rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>GRAND TOTAL:</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit', color: 'var(--color-success)' }}>
                  ₹{summary.grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

            </div>

            {/* Modal Pinned Sticky Footer */}
            <div style={{
              padding: '0.9rem 1.5rem',
              borderTop: '1px solid var(--glass-border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.95rem' }}>
                <span>
                  Total Items: <strong style={{ color: 'var(--text-primary)' }}>{summary.totalSets} Sets ({summary.totalPieces} Pieces)</strong>
                </span>
                <span style={{ color: 'var(--glass-border)' }}>|</span>
                <span>
                  Grand Total: <strong style={{ color: 'var(--color-success)', fontSize: '1.35rem', fontFamily: 'Outfit' }}>₹{summary.grandTotal.toLocaleString('en-IN')}</strong>
                </span>
                {lineItems.some(it => it.stock_status === 'inactive' || it.stock_status === 'out_of_stock') && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'rgba(245, 158, 11, 0.18)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    color: '#fbbf24',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 600
                  }}>
                    <AlertCircle size={14} />
                    Contains Inactive / Out-of-Stock Items
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => setIsFormOpen(false)} 
                  className="btn btn-secondary"
                  style={{ padding: '0.65rem 1.5rem', fontSize: '0.95rem' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 2rem', fontWeight: 600, fontSize: '1rem' }}
                >
                  <Save size={18} />
                  <span>{isEditing ? 'Update Proforma Invoice' : 'Generate Proforma Invoice'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>,
      document.body
    );
  };

  const renderPreviewModal = () => {
    if (!previewInvoice) return null;

    return createPortal(
      <div 
        className="proforma-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          overflowY: 'auto',
          padding: '2rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setPreviewInvoice(null);
          }
        }}
      >
        {/* Full Page Header & Actions (Hidden on Print) */}
        <div className="no-print" style={{ width: '100%', maxWidth: '880px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button 
              type="button" 
              onClick={() => setPreviewInvoice(null)} 
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem' }}
            >
              <ArrowLeft size={16} />
              <span>Back to Invoices</span>
            </button>
            <span style={{ color: '#ffffff', fontWeight: 600, fontSize: '1.1rem' }}>
              {previewInvoice.invoice_number}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={() => window.print()} 
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.25rem', fontWeight: 600, fontSize: '0.95rem' }}
            >
              <Printer size={16} />
              Print / Save as PDF
            </button>
            <button 
              onClick={() => handleDownloadExcel(previewInvoice.id, previewInvoice.invoice_number)} 
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.1rem', color: '#10b981', fontWeight: 600 }}
            >
              <FileSpreadsheet size={16} />
              Download Excel
            </button>
            <button 
              onClick={() => {
                const invToEdit = previewInvoice;
                setPreviewInvoice(null);
                handleOpenEditModal(invToEdit);
              }} 
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 1.1rem' }}
            >
              <Edit3 size={16} />
              Edit
            </button>
            <button 
              onClick={() => setPreviewInvoice(null)} 
              className="btn btn-secondary"
              style={{ padding: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable & Screenshot-Ready A4 Invoice Card Container */}
        <div 
          id="printable-proforma"
          className="proforma-print-container"
          style={{ 
            width: '100%', 
            maxWidth: '880px', 
            background: '#ffffff', 
            borderRadius: '8px', 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)', 
            padding: '2.5rem', 
            fontFamily: 'Calibri, Arial, sans-serif', 
            color: '#1e293b',
            boxSizing: 'border-box'
          }}
          onClick={(e) => e.stopPropagation()}
        >
              
              {/* Header: Company & Brand */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '2px', color: '#0f172a', margin: 0 }}>
                  {previewInvoice.company_brand || 'DESUKA'}
                </h1>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#c29b38', letterSpacing: '1px', marginTop: '2px' }}>
                  by {previewInvoice.company_name || 'VS FASHION'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                  {previewInvoice.company_address || 'IX-6362 Netaji Gali Gandhi nagar Delhi-110031'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '2px' }}>
                  GSTIN: <strong>{previewInvoice.company_gst || '07AKCPJ2754N1ZX'}</strong> | Phone: <strong>{previewInvoice.company_phone || '9718503340'}</strong> | Email: {previewInvoice.company_email || 'wholesale@desukafashion.com'}
                </div>
              </div>

              {/* Title Banner */}
              <div style={{ background: '#0f172a', color: '#ffffff', textAlign: 'center', padding: '0.45rem', fontWeight: 700, fontSize: '1.15rem', letterSpacing: '1px', marginBottom: '1.25rem' }}>
                PROFORMA INVOICE
              </div>

              {/* Buyer & Invoice Meta Split */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                
                {/* Left: Buyer Details */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', background: '#f8fafc' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Billed To (Buyer):
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                    {previewInvoice.business_name ? `${previewInvoice.business_name} (${previewInvoice.customer_name})` : previewInvoice.customer_name}
                  </div>
                  {previewInvoice.address && (
                    <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '2px' }}>
                      {previewInvoice.address}
                    </div>
                  )}
                  <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                    {previewInvoice.city ? `${previewInvoice.city}, ` : ''}{previewInvoice.state} ({previewInvoice.state_code})
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '4px' }}>
                    Phone: <strong>{previewInvoice.phone || 'N/A'}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#0f172a', marginTop: '2px' }}>
                    GSTIN: <strong style={{ fontFamily: 'monospace' }}>{previewInvoice.gst_number || 'URP / Not Provided'}</strong>
                  </div>
                </div>

                {/* Right: Meta Details */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>Invoice No:</span>
                    <strong style={{ color: '#0f172a', fontFamily: 'Outfit' }}>{previewInvoice.invoice_number}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>Invoice Date:</span>
                    <strong>{new Date(previewInvoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>Place of Supply:</span>
                    <strong>{previewInvoice.state} ({previewInvoice.state_code})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>Tax Mode:</span>
                    <strong>{previewInvoice.is_interstate ? 'Interstate (IGST)' : 'Intra-state (CGST + SGST)'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Prepared By:</span>
                    <span>{previewInvoice.created_by_username || 'Admin'}</span>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'center', width: '30px' }}>#</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'left' }}>Article No</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'center', width: '45px' }}>Sets</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'center', width: '55px' }}>Pcs/Set</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'center', width: '50px' }}>Qty</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'right', width: '70px' }}>Rate (₹)</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'right', width: '85px' }}>Taxable (₹)</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'center', width: '55px' }}>GST %</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'right', width: '80px' }}>GST (₹)</th>
                    <th style={{ padding: '7px 8px', border: '1px solid #0f172a', textAlign: 'right', width: '90px' }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewInvoice.items || []).map((it, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{it.article_number}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', color: '#475569' }}>{it.description || '-'}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{it.sets}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{it.pieces_per_set}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700 }}>{it.quantity}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' }}>
                        {parseFloat(it.rate as any).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' }}>
                        {parseFloat(it.taxable_amount as any).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>
                        {it.gst_rate}%
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'right', fontFamily: 'monospace' }}>
                        {parseFloat(it.gst_amount as any).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        {parseFloat(it.total_amount as any).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {/* Totals Line */}
                  <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>TOTALS:</td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{previewInvoice.total_sets}</td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>-</td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{previewInvoice.total_pieces}</td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>-</td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'right', fontFamily: 'monospace' }}>
                      ₹{parseFloat(previewInvoice.subtotal_taxable as string).toFixed(2)}
                    </td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>-</td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'right', fontFamily: 'monospace' }}>
                      ₹{parseFloat(previewInvoice.total_gst_amount as string).toFixed(2)}
                    </td>
                    <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'right', fontFamily: 'monospace', color: '#0f172a' }}>
                      ₹{parseFloat(previewInvoice.grand_total as string).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Bottom Split: Instructions & Notes (Left) & Final Amounts (Right) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                
                {/* Delivery Instructions & Notes (Replaced Bank Details) */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', background: '#f8fafc', fontSize: '0.85rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Delivery Instructions & Notes:
                  </div>
                  <div style={{ 
                    whiteSpace: 'pre-line', 
                    color: previewInvoice.notes ? '#0f172a' : '#64748b', 
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    fontStyle: previewInvoice.notes ? 'normal' : 'italic',
                    flex: 1
                  }}>
                    {previewInvoice.notes || 'No special delivery instructions specified.'}
                  </div>
                </div>

                {/* Amount Summary */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', background: '#f8fafc', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#475569' }}>Taxable Amount:</span>
                    <span style={{ fontFamily: 'monospace' }}>₹{parseFloat(previewInvoice.subtotal_taxable as string).toFixed(2)}</span>
                  </div>

                  {previewInvoice.is_interstate ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                      <span>IGST:</span>
                      <span style={{ fontFamily: 'monospace' }}>₹{parseFloat(previewInvoice.total_gst_amount as string).toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                        <span>CGST:</span>
                        <span style={{ fontFamily: 'monospace' }}>₹{(parseFloat(previewInvoice.total_gst_amount as string) / 2).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                        <span>SGST:</span>
                        <span style={{ fontFamily: 'monospace' }}>₹{(parseFloat(previewInvoice.total_gst_amount as string) / 2).toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  {parseFloat(previewInvoice.round_off as string) !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                      <span>Round Off:</span>
                      <span style={{ fontFamily: 'monospace' }}>₹{parseFloat(previewInvoice.round_off as string).toFixed(2)}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #0f172a', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>GRAND TOTAL:</span>
                    <strong style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'Outfit', color: '#0f172a' }}>
                      ₹{parseFloat(previewInvoice.grand_total as string).toLocaleString('en-IN')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Terms and Signatory */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  <div style={{ fontWeight: 700, marginBottom: '2px' }}>TERMS & CONDITIONS:</div>
                  <div style={{ whiteSpace: 'pre-line' }}>{previewInvoice.terms_conditions || '1. Goods once sold will not be taken back.\n2. 100% advance payment required before dispatch.'}</div>
                </div>

                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ height: '40px' }}></div>
                  <div style={{ borderTop: '1px solid #475569', width: '180px', paddingTop: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    For VS FASHION
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Authorized Signatory</div>
                </div>
              </div>

        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Header */}
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={26} color="var(--color-primary)" />
            <h1 style={{ fontSize: '1.8rem', letterSpacing: '-0.02em' }}>Proforma Invoices (P.I.)</h1>
            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              Garment GST Slabs
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.9rem' }}>
            Generate wholesale proforma quotations linked with catalog SKUs, automatic 5% & 18% GST calculation, print PDF & export Excel.
          </p>
        </div>

        <button 
          onClick={handleOpenCreateModal} 
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', fontSize: '0.95rem', fontWeight: 600 }}
        >
          <Plus size={18} />
          Create Proforma Invoice
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-success)', padding: '0.9rem 1.2rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--color-danger)', padding: '0.9rem 1.2rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="glass-card" style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search by Invoice No, Customer, Business, City, Phone..." 
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: '2.4rem', width: '100%' }}
          />
        </div>

        <div style={{ width: '180px' }}>
          <select 
            value={statusFilter} 
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ width: '100%' }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <button onClick={fetchInvoices} className="btn btn-secondary" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Invoices List Table */}
      <div className="glass-card" style={{ padding: '0' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date</th>
                <th>Buyer / Business</th>
                <th>City & Phone</th>
                <th>Sets / Pieces</th>
                <th>Taxable Val</th>
                <th>GST Amt</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Created By</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    Loading proforma invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    No proforma invoices found. Click "Create Proforma Invoice" above to generate your first quotation.
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <strong style={{ fontFamily: 'Outfit', color: 'var(--color-primary)' }}>{inv.invoice_number}</strong>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {new Date(inv.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <div>
                        <strong>{inv.customer_name}</strong>
                        {inv.business_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {inv.business_name}
                          </div>
                        )}
                        {inv.gst_number && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            GST: {inv.gst_number}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      <div>{inv.city || '-'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{inv.phone || ''}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{inv.total_sets} Sets</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({inv.total_pieces} Pcs)</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      ₹{parseFloat(inv.subtotal_taxable as string).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: '#f59e0b' }}>
                      ₹{parseFloat(inv.total_gst_amount as string).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <strong style={{ fontFamily: 'Outfit', fontSize: '1rem', color: 'var(--text-primary)' }}>
                        ₹{parseFloat(inv.grand_total as string).toLocaleString('en-IN')}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge ${
                        inv.status === 'confirmed' ? 'badge-success' :
                        inv.status === 'sent' ? 'badge-info' :
                        inv.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {inv.created_by_username || 'Admin'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                        <button 
                          onClick={() => handlePreview(inv)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="View & Print PDF"
                        >
                          <Printer size={15} color="var(--color-primary)" />
                        </button>
                        <button 
                          onClick={() => handleDownloadExcel(inv.id, inv.invoice_number)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="Download Excel (.xlsx)"
                        >
                          <FileSpreadsheet size={15} color="var(--color-success)" />
                        </button>
                        <button 
                          onClick={() => handleOpenEditModal(inv)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="Edit Invoice"
                        >
                          <Edit3 size={15} color="var(--color-secondary)" />
                        </button>
                        <button 
                          onClick={() => handleDuplicate(inv)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="Duplicate as new Draft"
                        >
                          <Copy size={15} color="var(--text-secondary)" />
                        </button>
                        <button 
                          onClick={() => handleDelete(inv)} 
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="Delete Invoice"
                        >
                          <Trash2 size={15} color="var(--color-danger)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {totalCount > 20 && (
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Showing {invoices.length} of {totalCount} Invoices
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem' }}
              >
                Previous
              </button>
              <button 
                onClick={() => setPage(p => p + 1)} 
                disabled={page * 20 >= totalCount}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Render Create / Edit and Preview Modals via React Portal */}
      {renderCreateEditModal()}
      {renderPreviewModal()}

    </div>
  );
}
