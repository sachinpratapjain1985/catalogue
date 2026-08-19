import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderPlus, 
  Upload, 
  Trash2, 
  Search, 
  Filter, 
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Edit2,
  Check,
  X,
  AlertCircle,
  Share2,
  Copy,
  Download,
  Camera
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
}

interface SKUItem {
  id: number;
  sku_id: string;
  category_id: number;
  image_path: string;
  pieces_per_set: number;
  description: string;
  material: string;
  rate: number;
  sets_count: number;
  total_pieces: number;
  is_available: boolean;
  original_created_at?: string;
  created_at: string;
  category_name?: string;
  real_image_count?: number;
  real_images?: string[];
}

interface UserProfile {
  id: number;
  username: string;
  role: 'superadmin' | 'manager' | 'both' | 'stockist' | 'sales';
}

interface CatalogsProps {
  token: string;
  user: UserProfile | null;
}

export default function Catalogs({ token, user }: CatalogsProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<SKUItem[]>([]);
  
  // Category creation states
  const [newCatName, setNewCatName] = useState('');
  
  // SKU creation states
  const [skuId, setSkuId] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [piecesPerSet, setPiecesPerSet] = useState(4);
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('');
  const [rate, setRate] = useState('');
  const [stockType, setStockType] = useState<'new' | 'old'>('new');
  const [originalCreatedAt, setOriginalCreatedAt] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  // Modal Edit states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SKUItem | null>(null);
  const [editSkuId, setEditSkuId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editPiecesPerSet, setEditPiecesPerSet] = useState(4);
  const [editMaterial, setEditMaterial] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editSetsCount, setEditSetsCount] = useState(0);
  const [editIsAvailable, setEditIsAvailable] = useState(true);
  const [editDescription, setEditDescription] = useState('');

  // Folder/Category editing states
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  // WhatsApp Web multi-share states
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [sharePhone, setSharePhone] = useState('');
  const [webSendDescription, setWebSendDescription] = useState(false);
  const [webShareRealImages, setWebShareRealImages] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copyingImgId, setCopyingImgId] = useState<number | null>(null);

  // RAW Real Images states
  const [realImagesFiles, setRealImagesFiles] = useState<File[]>([]);
  const [realImagesPreviews, setRealImagesPreviews] = useState<string[]>([]);
  const [realImagesModalItem, setRealImagesModalItem] = useState<SKUItem | null>(null);
  const [realImagesList, setRealImagesList] = useState<Array<{ id: number; item_id: number; image_path: string; watermarked_path: string }>>([]);
  const [uploadingRealImages, setUploadingRealImages] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filters/Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCatId, setFilterCatId] = useState('');
  const [filterAgeLimit, setFilterAgeLimit] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRateRange, setFilterRateRange] = useState('');

  // Messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasSetInitialFolder = useRef(false);

  useEffect(() => {
    fetchCategories();
    fetchSKUs();
  }, []);

  useEffect(() => {
    if (categories.length > 0) {
      if (!hasSetInitialFolder.current) {
        setFilterCatId(categories[0].id.toString());
        hasSetInitialFolder.current = true;
      } else {
        // If selected folder is deleted, fallback to the first folder
        setFilterCatId(prev => {
          if (prev === '') return prev; // Keep "All Folders" if explicitly selected
          const exists = categories.some(c => c.id.toString() === prev);
          return exists ? prev : categories[0].id.toString();
        });
      }
    }
  }, [categories]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/catalog/categories', {
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

  const fetchSKUs = async () => {
    try {
      const response = await fetch('/api/admin/items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (e) {
      console.error('Failed to load SKU items', e);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newCatName })
      });

      const data = await response.json();

      if (response.ok) {
        setCategories([...categories, data].sort((a, b) => a.name.localeCompare(b.name)));
        setNewCatName('');
        showSuccess('Folder created successfully');
      } else {
        showError(data.error || 'Failed to create folder');
      }
    } catch (err) {
      showError('Network error');
    }
  };

  const handleDeleteCategory = async (catId: number, catName: string) => {
    if (!window.confirm(`Are you sure you want to delete category "${catName}"? This will delete ALL image files and SKU designs associated with it!`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/categories/${catId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setCategories(categories.filter(c => c.id !== catId));
        fetchSKUs(); // reload SKUs since some might be deleted
        showSuccess('Category folder deleted');
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete category');
      }
    } catch (e) {
      showError('Network error');
    }
  };

  const handleRenameCategory = async (catId: number) => {
    if (!editingCatName.trim()) return;

    try {
      const response = await fetch(`/api/admin/categories/${catId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: editingCatName.trim() })
      });

      const data = await response.json();

      if (response.ok) {
        setCategories(categories.map(c => c.id === catId ? data : c).sort((a, b) => a.name.localeCompare(b.name)));
        setEditingCatId(null);
        showSuccess('Folder renamed successfully');
      } else {
        showError(data.error || 'Failed to rename folder');
      }
    } catch (err) {
      showError('Network error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
    }
  };

  const handleRealImagesFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files).slice(0, 5);
      setRealImagesFiles(filesArr);
      setRealImagesPreviews(filesArr.map(f => URL.createObjectURL(f)));
    }
  };

  const fetchRealImagesForItem = async (item: SKUItem) => {
    setRealImagesModalItem(item);
    try {
      const response = await fetch(`/api/admin/items/${item.id}/real-images`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRealImagesList(data);
      }
    } catch (e) {
      console.error('Failed to load real images', e);
    }
  };

  const handleUploadRealImagesToExistingItem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!realImagesModalItem || !e.target.files || e.target.files.length === 0) return;
    const filesArr = Array.from(e.target.files).slice(0, 5);
    
    setUploadingRealImages(true);
    const formData = new FormData();
    filesArr.forEach(file => {
      formData.append('real_images', file);
    });

    try {
      const response = await fetch(`/api/admin/items/${realImagesModalItem.id}/real-images`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        const newImgs = await response.json();
        const updatedList = [...realImagesList, ...newImgs];
        setRealImagesList(updatedList);
        setItems(prevItems => prevItems.map(it => {
          if (it.id === realImagesModalItem.id) {
            return {
              ...it,
              real_image_count: updatedList.length,
              real_images: updatedList.map(img => img.watermarked_path)
            };
          }
          return it;
        }));
        setRealImagesModalItem(prev => prev ? { ...prev, real_image_count: updatedList.length } : null);
        showSuccess('RAW Real photos uploaded and watermarked successfully');
        fetchSKUs();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to upload real images');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setUploadingRealImages(false);
    }
  };

  const handleDeleteRealImage = async (imageId: number) => {
    if (!window.confirm('Are you sure you want to delete this real photo?')) return;
    try {
      const response = await fetch(`/api/admin/items/real-images/${imageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const updatedList = realImagesList.filter(img => img.id !== imageId);
        setRealImagesList(updatedList);
        if (realImagesModalItem) {
          setItems(prevItems => prevItems.map(it => {
            if (it.id === realImagesModalItem.id) {
              return {
                ...it,
                real_image_count: updatedList.length,
                real_images: updatedList.map(img => img.watermarked_path)
              };
            }
            return it;
          }));
          setRealImagesModalItem(prev => prev ? { ...prev, real_image_count: updatedList.length } : null);
        }
        showSuccess('Real photo deleted');
        fetchSKUs();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete real image');
      }
    } catch (e) {
      showError('Network error');
    }
  };

  const handleUploadSKU = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuId.trim() || !selectedCatId || !selectedFile) {
      showError('Please fill all SKU details and select an image');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const formData = new FormData();
    formData.append('skuId', skuId.trim());
    formData.append('categoryId', selectedCatId);
    formData.append('piecesPerSet', piecesPerSet.toString());
    formData.append('description', description.trim());
    formData.append('material', material.trim());
    formData.append('rate', rate.trim() || '0');
    formData.append('originalCreatedAt', stockType === 'old' ? new Date(originalCreatedAt).toISOString() : new Date().toISOString());
    formData.append('image', selectedFile);

    if (realImagesFiles.length > 0) {
      realImagesFiles.forEach(file => {
        formData.append('real_images', file);
      });
    }

    try {
      const response = await fetch('/api/admin/items', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        setItems([data, ...items]);
        
        // Reset form
        setSkuId('');
        setPiecesPerSet(4);
        setDescription('');
        setMaterial('');
        setRate('');
        setStockType('new');
        setOriginalCreatedAt(new Date().toISOString().split('T')[0]);
        setSelectedFile(null);
        setFilePreview(null);
        setRealImagesFiles([]);
        setRealImagesPreviews([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        showSuccess(`SKU ${data.sku_id} created successfully`);
      } else {
        showError(data.error || 'Failed to upload SKU');
      }
    } catch (err) {
      showError('Upload failed due to connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSKU = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const response = await fetch(`/api/admin/items/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          skuId: editSkuId,
          categoryId: editCategoryId,
          piecesPerSet: editPiecesPerSet,
          material: editMaterial,
          rate: editRate,
          setsCount: editSetsCount,
          isAvailable: editIsAvailable,
          description: editDescription
        })
      });

      const data = await response.json();

      if (response.ok) {
        setItems(items.map(item => item.id === editingItem.id ? data : item));
        setIsEditModalOpen(false);
        setEditingItem(null);
        showSuccess('SKU updated successfully');
      } else {
        showError(data.error || 'Failed to update SKU');
      }
    } catch (err) {
      showError('Failed to save update');
    }
  };

  const handleDeleteSKU = async (itemId: number, skuCode: string) => {
    if (!window.confirm(`Are you sure you want to delete SKU design "${skuCode}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setItems(items.filter(item => item.id !== itemId));
        showSuccess('SKU design deleted');
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete SKU');
      }
    } catch (e) {
      showError('Network error');
    }
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const getThumbnailUrl = (imagePath: string) => {
    if (!imagePath) return '';
    const lastDotIndex = imagePath.lastIndexOf('.');
    if (lastDotIndex !== -1 && !imagePath.includes('-thumb.')) {
      return imagePath.substring(0, lastDotIndex) + '-thumb' + imagePath.substring(lastDotIndex);
    }
    return imagePath;
  };

  const handleToggleSelect = (itemId: number) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        if (user?.role === 'sales' && prev.length >= 6) {
          showError('Sales users can only select up to 6 designs at a time.');
          return prev;
        }
        return [...prev, itemId];
      }
    });
  };

  const handleToggleSelectAll = () => {
    const allVisibleIds = filteredItems.map(item => item.id);
    const allSelected = allVisibleIds.every(id => selectedItems.includes(id));
    
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !allVisibleIds.includes(id)));
    } else {
      setSelectedItems(prev => {
        if (user?.role === 'sales') {
          const remainingSlots = 6 - prev.length;
          if (remainingSlots <= 0) {
            showError('Sales users can only select up to 6 designs at a time.');
            return prev;
          }
          const toAdd = allVisibleIds.filter(id => !prev.includes(id)).slice(0, remainingSlots);
          if (toAdd.length < allVisibleIds.filter(id => !prev.includes(id)).length) {
            showError(`Sales users can only select up to 6 designs. Selected first ${toAdd.length} items.`);
          }
          return [...prev, ...toAdd];
        }
        const unique = new Set([...prev, ...allVisibleIds]);
        return Array.from(unique);
      });
    }
  };

  const generateShareText = () => {
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    let text = '';
    if (selectedItemsData.length === 1) {
      const item = selectedItemsData[0];
      text += `Design SKU: ${item.sku_id}\n`;
      if (item.material) {
        text += `Work/Material: ${item.material}\n`;
      }
      if (webSendDescription && item.description) {
        text += `Description: ${item.description}\n`;
      }
      text += `\nShared via Desuka Catalog`;
    } else {
      text += `Designs from Desuka Catalogue:\n\n`;
      selectedItemsData.forEach(item => {
        text += `• SKU: ${item.sku_id}\n`;
        if (item.material) {
          text += `  Work/Material: ${item.material}\n`;
        }
        if (webSendDescription && item.description) {
          text += `  Description: ${item.description}\n`;
        }
        text += `\n`;
      });
      text += `Shared via Desuka Catalog`;
    }
    return text;
  };

  const handleCopyDetails = () => {
    const text = generateShareText();
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleDownloadSelectedImages = () => {
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    if (user?.role === 'sales' && selectedItemsData.length > 6) {
      showError('Sales users can only download up to 6 designs at a time.');
      return;
    }
    
    let downloadDelay = 0;
    selectedItemsData.forEach(item => {
      if (webShareRealImages && item.real_images && item.real_images.length > 0) {
        item.real_images.forEach((realPath, rIdx) => {
          setTimeout(() => {
            const link = document.createElement('a');
            link.href = realPath;
            link.download = `${item.sku_id}-real-${rIdx + 1}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }, downloadDelay);
          downloadDelay += 300;
        });
      } else {
        setTimeout(() => {
          const link = document.createElement('a');
          if (user?.role === 'sales') {
            link.href = `/api/catalog/items/${item.id}/medium?token=${encodeURIComponent(token)}`;
            const ext = item.image_path.substring(item.image_path.lastIndexOf('.'));
            link.download = `${item.sku_id}-medium${ext}`;
          } else {
            link.href = item.image_path;
            const ext = item.image_path.substring(item.image_path.lastIndexOf('.'));
            link.download = `${item.sku_id}${ext}`;
          }
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, downloadDelay);
        downloadDelay += 300;
      }
    });
  };

  const handleShareWhatsAppWeb = () => {
    const text = generateShareText();
    const cleanNum = sharePhone.trim().replace(/\D/g, '');
    const url = cleanNum 
      ? `https://web.whatsapp.com/send?phone=${cleanNum}&text=${encodeURIComponent(text)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyImageToClipboard = async (imagePath: string, itemId: number) => {
    try {
      setCopyingImgId(itemId);
      
      const imagePromise = new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imagePath;
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image format'));
            }
          }, 'image/png');
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
      });

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': imagePromise
        })
      ]);

      showSuccess('Photo copied to clipboard! Paste it into WhatsApp.');
      setTimeout(() => setCopyingImgId(null), 2000);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      showError('Browser blocked copying. Right-click the thumbnail and select "Copy Image".');
      setCopyingImgId(null);
    }
  };


  // Filter items including age limitation (>60 days), status, and sort them
  const filteredItems = items
    .filter(item => {
      const matchesSearch = item.sku_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCatId === '' || item.category_id === parseInt(filterCatId);
      
      let matchesAge = true;
      if (filterAgeLimit) {
        const ageInDays = Math.max(0, Math.floor((new Date().getTime() - new Date(item.original_created_at || item.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        matchesAge = ageInDays >= 60;
      }

      const matchesStatus = filterStatus === '' || 
        (filterStatus === 'A' && item.is_available && item.sets_count > 0) ||
        (filterStatus === 'OS' && item.is_available && item.sets_count === 0) ||
        (filterStatus === 'NA' && !item.is_available);

      let matchesRate = true;
      if (filterRateRange) {
        const [minStr, maxStr] = filterRateRange.split('-');
        const minVal = parseInt(minStr);
        const maxVal = parseInt(maxStr);
        const itemRate = item.rate || 0;
        if (!isNaN(minVal)) matchesRate = matchesRate && itemRate >= minVal;
        if (!isNaN(maxVal)) matchesRate = matchesRate && itemRate <= maxVal;
      }
      
      // Ensure item belongs to one of the user's permitted categories
      const allowedCatIds = categories.map(c => c.id);
      const isPermittedCategory = allowedCatIds.includes(item.category_id);

      return isPermittedCategory && matchesSearch && matchesCategory && matchesAge && matchesStatus && matchesRate;
    })
    .sort((a, b) => {
      // Sort items: Available (A) first, Out of Stock (OS) second, Inactive (NA) last
      const aAvailable = a.is_available && a.sets_count > 0;
      const bAvailable = b.is_available && b.sets_count > 0;
      if (aAvailable !== bAvailable) {
        return aAvailable ? -1 : 1;
      }
      
      const aOS = a.is_available && a.sets_count === 0;
      const bOS = b.is_available && b.sets_count === 0;
      if (aOS !== bOS) {
        return aOS ? -1 : 1;
      }
      
      // Secondary sort: serial wise (natural sort)
      return a.sku_id.localeCompare(b.sku_id, undefined, { numeric: true, sensitivity: 'base' });
    });

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCatId, filterAgeLimit, filterStatus, filterRateRange]);

  const itemsPerPage = 15;
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const totalDesigns = items.length;
  const activeDesigns = items.filter(item => item.is_available && item.sets_count > 0).length;
  const outOfStockDesigns = items.filter(item => item.is_available && item.sets_count === 0).length;
  const inactiveDesigns = items.filter(item => !item.is_available).length;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1>Catalog & SKU Management</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Create folders and upload designs SKU-wise</p>
      </div>

      {/* Design Counts Summary Ribbon */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total SKU Designs</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>{totalDesigns}</div>
          </div>
          <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-primary)' }}>
            <ImageIcon size={20} />
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', textTransform: 'uppercase', fontWeight: 600 }}>Available (In Stock)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.25rem' }}>{activeDesigns}</div>
          </div>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-success)' }}>
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-warning)', textTransform: 'uppercase', fontWeight: 600 }}>Available (Out of Stock)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '0.25rem' }}>{outOfStockDesigns}</div>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-warning)' }}>
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', textTransform: 'uppercase', fontWeight: 600 }}>Unavailable Designs</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-danger)', marginTop: '0.25rem' }}>{inactiveDesigns}</div>
          </div>
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)' }}>
            <XCircle size={20} />
          </div>
        </div>
      </div>

      {/* Success/Error Alerts */}
      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-success)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--color-danger)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
          {errorMsg}
        </div>
      )}

      {user?.role !== 'sales' && (
        <div className="grid-2">
        {/* Create Folder / Category */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FolderPlus size={20} color="var(--color-primary)" />
            Create Category Folder
          </h3>
          <form onSubmit={handleCreateCategory} className="flex-between" style={{ alignItems: 'flex-end', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Folder / Category Name</label>
              <input 
                type="text" 
                placeholder="e.g. CROPTOP NET Regular" 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Create</button>
          </form>

          <hr style={{ border: '0', borderTop: '1px solid var(--glass-border)' }} />

          {/* List of Category Folders */}
          <label>Active Category Folders</label>
          <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {categories.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No folder categories created yet.</p>
            ) : (
              categories.map(cat => {
                const isEditing = editingCatId === cat.id;
                const isSuperAdmin = user?.role === 'superadmin';

                return (
                  <div key={cat.id} className="flex-between" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.02)', minHeight: '44px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
                        <input 
                          type="text" 
                          value={editingCatName}
                          onChange={e => setEditingCatName(e.target.value)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', flex: 1 }}
                        />
                        <button 
                          onClick={() => handleRenameCategory(cat.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-success)', padding: '4px' }}
                          title="Save Name"
                        >
                          <Check size={16} />
                        </button>
                        <button 
                          onClick={() => setEditingCatId(null)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{cat.name}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {isSuperAdmin && (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingCatId(cat.id);
                                  setEditingCatName(cat.name);
                                }}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: '4px' }}
                                title="Rename Category Folder"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button 
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: '4px' }}
                                title="Delete folder and contents"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upload SKU Form */}
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Upload size={20} color="var(--color-primary)" />
            Upload SKU Design
          </h3>
          <form onSubmit={handleUploadSKU} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>SKU ID (Unique Identifier)</label>
              <input 
                type="text" 
                placeholder="e.g. SKU-1002-BLACK" 
                value={skuId}
                onChange={e => setSkuId(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Folder / Category</label>
                <select 
                  value={selectedCatId} 
                  onChange={e => setSelectedCatId(e.target.value)}
                  required
                >
                  <option value="">Select Folder</option>
                  {categories.map(c => {
                    const catItems = items.filter(item => item.category_id === c.id);
                    const activeCount = catItems.filter(item => item.is_available && item.sets_count > 0).length;
                    const osCount = catItems.filter(item => item.is_available && item.sets_count === 0).length;
                    const naCount = catItems.filter(item => !item.is_available).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} (A-{activeCount} OS-{osCount} NA-{naCount})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Pieces per Set</label>
                <input 
                  type="number" 
                  min="1"
                  value={piecesPerSet}
                  onChange={e => setPiecesPerSet(parseInt(e.target.value) || 4)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Material Details</label>
                <input 
                  type="text" 
                  placeholder="e.g. Net Cotton, Silk, Georgette" 
                  value={material}
                  onChange={e => setMaterial(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Rate / Price of Article (₹)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 1495" 
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.8rem 1.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', alignItems: 'center' }}>
              <label style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Stock Classification:</label>
              <label style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <input 
                  type="radio" 
                  name="stockType" 
                  checked={stockType === 'new'} 
                  onChange={() => setStockType('new')} 
                />
                New Stock
              </label>
              <label style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <input 
                  type="radio" 
                  name="stockType" 
                  checked={stockType === 'old'} 
                  onChange={() => setStockType('old')} 
                />
                Old Stock
              </label>
              
              {stockType === 'old' && (
                <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                  <label style={{ margin: 0, fontSize: '0.85rem' }}>Creation Date:</label>
                  <input 
                    type="date" 
                    value={originalCreatedAt} 
                    onChange={e => setOriginalCreatedAt(e.target.value)}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', width: 'auto' }}
                    required
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Product Description / Notes</label>
              <textarea 
                placeholder="Enter catalog design description notes..." 
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                style={{ 
                  resize: 'vertical', 
                  background: 'var(--bg-primary)', 
                  border: '1px solid var(--glass-border)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '0.75rem 1rem', 
                  color: 'var(--text-primary)', 
                  fontFamily: 'inherit',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            {/* Drag & Drop File Selector */}
            <div 
              style={{
                border: '2px dashed var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.01)',
                position: 'relative'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*"
                style={{ display: 'none' }} 
              />
              
              {filePreview ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <img 
                    src={filePreview} 
                    alt="Preview" 
                    style={{ maxHeight: '100px', borderRadius: 'var(--radius-sm)', objectFit: 'contain' }} 
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>Click to replace image</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                  <ImageIcon size={32} style={{ opacity: 0.5 }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Click to select catalog design photo</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>JPG, PNG or WEBP (Max 5MB)</span>
                </div>
              )}
            </div>

            {/* Optional RAW Real Photos Selector */}
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                <Camera size={14} color="var(--color-primary)" />
                Optional: RAW Real Photos (2-3 photos)
              </label>
              <input 
                type="file" 
                multiple
                accept="image/*"
                onChange={handleRealImagesFilesChange}
                style={{ fontSize: '0.85rem' }}
              />
              {realImagesPreviews.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  {realImagesPreviews.map((src, i) => (
                    <img key={i} src={src} alt={`Real ${i}`} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--glass-border)' }} />
                  ))}
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Uploading File...' : 'Upload Design'}
            </button>
          </form>
        </div>
      </div>
      )}

      {/* SKUs Grid section with Search & Filters */}
      <div className="glass-card">
        <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
          <h3>Design Catalog Directory ({filteredItems.length} items)</h3>
          
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search SKU..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.25rem', width: '200px' }}
              />
            </div>
            
            {/* Filter Folder */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={16} color="var(--text-muted)" />
              <select 
                value={filterCatId} 
                onChange={e => setFilterCatId(e.target.value)}
                style={{ padding: '0.6rem 1rem' }}
              >
                <option value="">All Folders</option>
                {categories.map(c => {
                  const catItems = items.filter(item => item.category_id === c.id);
                  const activeCount = catItems.filter(item => item.is_available && item.sets_count > 0).length;
                  const osCount = catItems.filter(item => item.is_available && item.sets_count === 0).length;
                  const naCount = catItems.filter(item => !item.is_available).length;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} (A-{activeCount} OS-{osCount} NA-{naCount})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Filter Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={16} color="var(--text-muted)" />
              <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
                style={{ padding: '0.6rem 1rem' }}
              >
                <option value="">All Statuses</option>
                <option value="A">Available (A)</option>
                <option value="OS">Out of Stock (OS)</option>
                <option value="NA">Inactive (NA)</option>
              </select>
            </div>

            {/* Filter Rate / Price Range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select 
                value={filterRateRange} 
                onChange={e => setFilterRateRange(e.target.value)}
                style={{ padding: '0.6rem 1rem' }}
              >
                <option value="">All Prices</option>
                <option value="0-1000">Below ₹1,000</option>
                <option value="0-1500">Below ₹1,500</option>
                <option value="0-2000">Below ₹2,000</option>
                <option value="0-2500">Below ₹2,500</option>
                <option value="1000-1500">₹1,000 - ₹1,500</option>
                <option value="1000-2000">₹1,000 - ₹2,000</option>
                <option value="1500-2000">₹1,500 - ₹2,000</option>
                <option value="2000-3000">₹2,000 - ₹3,000</option>
                <option value="2000-999999">Above ₹2,000</option>
                <option value="2500-999999">Above ₹2,500</option>
                <option value="3000-999999">Above ₹3,000</option>
              </select>
            </div>

            {/* Filter Age */}
            <button 
              type="button"
              className={`btn ${filterAgeLimit ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterAgeLimit(!filterAgeLimit)}
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              Older than 60 Days Only
            </button>

            <button 
              type="button"
              className="btn btn-secondary"
              onClick={handleToggleSelectAll}
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              {filteredItems.every(item => selectedItems.includes(item.id)) && filteredItems.length > 0 
                ? 'Deselect All' 
                : 'Select All Visible'}
            </button>
          </div>
        </div>

        {/* Catalog items grid */}
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
            No SKU designs match your filters. Upload some designs or adjust filters!
          </div>
        ) : (
          <>
            <div className="catalog-grid">
              {paginatedItems.map(item => {
                const ageInDays = Math.max(0, Math.floor((new Date().getTime() - new Date(item.original_created_at || item.created_at).getTime()) / (1000 * 60 * 60 * 24)));

                return (
                  <div key={item.id} className="catalog-card fade-in" style={{
                    border: ageInDays >= 60 ? '1px solid rgba(244,63,94,0.3)' : '1px solid var(--glass-border)'
                  }}>
                    <div className="catalog-image-wrapper">
                      {/* Selection Checkbox */}
                      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10 }}>
                        <input 
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                          style={{ 
                            width: '20px', 
                            height: '20px', 
                            cursor: 'pointer',
                            accentColor: 'var(--color-primary)',
                            borderRadius: '4px',
                            border: '2px solid white',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}
                        />
                      </div>
                      <img 
                        src={getThumbnailUrl(item.image_path)} 
                        alt={item.sku_id} 
                        className="catalog-image" 
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src !== item.image_path) {
                            target.src = item.image_path;
                          }
                        }}
                      />
                      <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                        {!item.is_available ? (
                          <span className="badge badge-danger" title="Inactive (Not Available)">
                            <XCircle size={12} style={{ marginRight: '4px' }} />
                            Inactive (NA)
                          </span>
                        ) : item.sets_count > 0 ? (
                          <span className="badge badge-success" title="Active & Available">
                            <CheckCircle size={12} style={{ marginRight: '4px' }} />
                            Available (A)
                          </span>
                        ) : (
                          <span className="badge badge-warning" title="Active but Out of Stock">
                            <XCircle size={12} style={{ marginRight: '4px' }} />
                            Out of Stock (OS)
                          </span>
                        )}
                        
                        {ageInDays >= 60 && (
                          <span className="badge badge-danger" style={{ background: '#f43f5e', border: 'none', color: '#fff' }}>
                            OLD STOCK ({ageInDays}d)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="catalog-details">
                      <div className="flex-between">
                        <span className="sku-tag">{item.sku_id}</span>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button 
                            onClick={() => fetchRealImagesForItem(item)}
                            style={{ border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '3px 7px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}
                            title="Manage RAW Real Photos"
                          >
                            <Camera size={12} />
                            RAW ({item.real_image_count || 0})
                          </button>
                          {user?.role !== 'sales' && (
                            <button 
                              onClick={() => {
                                setEditingItem(item);
                                setEditSkuId(item.sku_id);
                                setEditCategoryId(item.category_id.toString());
                                setEditPiecesPerSet(item.pieces_per_set);
                                setEditMaterial(item.material || '');
                                setEditRate(item.rate.toString());
                                setEditSetsCount(item.sets_count);
                                setEditIsAvailable(item.is_available);
                                setEditDescription(item.description || '');
                                setIsEditModalOpen(true);
                              }}
                              style={{ border: 'none', background: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                              title="Edit SKU Details"
                            >
                              Edit
                            </button>
                          )}
                          {user?.role === 'superadmin' && (
                            <button 
                              onClick={() => handleDeleteSKU(item.id, item.sku_id)}
                              style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '2px' }}
                              title="Delete SKU Design"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <span className="folder-tag">{item.category_name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Age: <strong>{ageInDays} days</strong>
                        </span>
                      </div>

                      {item.material && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-secondary)', display: 'block', marginTop: '2px' }}>
                          Material: {item.material}
                        </span>
                      )}
                      {item.description && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: '4px', lineHeight: '1.2' }} title={item.description}>
                          {item.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.5rem' }}>
                        <div>
                          <span>Sets: <strong>{item.sets_count}</strong> ({item.pieces_per_set} pc/set)</span>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Qty: <strong>{item.total_pieces}</strong></span>
                        </div>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                          ₹{item.rate || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`btn ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.5rem 1rem', minWidth: '40px' }}
                  >
                    {page}
                  </button>
                ))}
                
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit SKU Modal Dialog */}
      {isEditModalOpen && editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 8, 16, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1.5rem'
        }}>
          <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between">
              <h3>Edit SKU Design Details</h3>
              <button 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingItem(null);
                }}
                style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateSKU} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>SKU ID (SKU Number)</label>
                <input 
                  type="text" 
                  value={editSkuId}
                  onChange={e => setEditSkuId(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Folder / Category</label>
                  <select 
                    value={editCategoryId} 
                    onChange={e => setEditCategoryId(e.target.value)}
                    required
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label>Pieces per Set</label>
                  <input 
                    type="number" 
                    min="1"
                    value={editPiecesPerSet}
                    onChange={e => setEditPiecesPerSet(parseInt(e.target.value) || 4)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Material Details</label>
                  <input 
                    type="text" 
                    value={editMaterial}
                    onChange={e => setEditMaterial(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label>Rate / Price of Article (₹)</label>
                  <input 
                    type="number" 
                    value={editRate}
                    onChange={e => setEditRate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Sets Count</label>
                  <input 
                    type="number" 
                    min="0"
                    value={editSetsCount}
                    onChange={e => setEditSetsCount(parseInt(e.target.value) || 0)}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1, justifyContent: 'center', marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem', textTransform: 'none', fontWeight: 600 }}>
                    <input 
                      type="checkbox"
                      checked={editIsAvailable}
                      onChange={e => setEditIsAvailable(e.target.checked)}
                    />
                    Available in Stock
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Product Description / Notes</label>
                <textarea 
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                  style={{ 
                    resize: 'vertical', 
                    background: 'var(--bg-primary)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '0.75rem 1rem', 
                    color: 'var(--text-primary)', 
                    fontFamily: 'inherit',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingItem(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating WhatsApp Share Bar */}
      {selectedItems.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '55%',
          transform: 'translateX(-50%)',
          width: '80%',
          maxWidth: '850px',
          background: 'rgba(18, 20, 24, 0.9)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '1rem 1.5rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          color: 'white',
          animation: 'slideUp 0.3s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ 
                background: 'var(--color-primary)', 
                color: 'white', 
                padding: '0.25rem 0.6rem', 
                borderRadius: '50px', 
                fontSize: '0.85rem',
                fontWeight: 'bold'
              }}>
                {selectedItems.length}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Designs Selected</span>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                type="button" 
                onClick={() => setSelectedItems([])}
                style={{ 
                  background: 'rgba(255, 255, 255, 0.1)', 
                  border: 'none', 
                  color: 'white', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '8px', 
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Clear Selection
              </button>
            </div>
          </div>

          {/* Selected items photo quick-copy drawer */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#25D366', display: 'flex', alignItems: 'center', gap: '4px' }}>
                📸 Quick Copy Photos for WhatsApp (No Downloads)
              </span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                Click "Copy Photo" or right-click the thumbnail to copy. Then open WhatsApp and press <strong>Ctrl+V</strong> to paste and send!
              </span>
            </div>
            
            <div style={{
              display: 'flex',
              gap: '1rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem',
              maxHeight: '120px',
              scrollbarWidth: 'thin'
            }}>
              {items.filter(item => selectedItems.includes(item.id)).map(item => (
                <div 
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '0.4rem',
                    gap: '0.5rem',
                    minWidth: '200px',
                    flexShrink: 0,
                    position: 'relative'
                  }}
                >
                  <img 
                    src={getThumbnailUrl(item.image_path)}
                    alt={item.sku_id}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src !== item.image_path) {
                        target.src = item.image_path;
                      }
                    }}
                    style={{
                      width: '45px',
                      height: '45px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                    title="Right-click -> Copy Image (as backup)"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {item.sku_id}
                    </span>
                    {item.material && (
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {item.material}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyImageToClipboard(item.image_path, item.id)}
                    style={{
                      background: copyingImgId === item.id ? 'rgba(37, 211, 102, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      border: copyingImgId === item.id ? '1px solid #25D366' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      padding: '0.3rem 0.6rem',
                      color: copyingImgId === item.id ? '#25D366' : 'white',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    {copyingImgId === item.id ? (
                      <>
                        <Check size={12} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        Copy Photo
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>

            {/* Phone Number Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
              <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                Customer WhatsApp No. (e.g. 919876543210)
              </label>
              <input 
                type="text" 
                placeholder="Enter country code + number" 
                value={sharePhone}
                onChange={e => setSharePhone(e.target.value)}
                style={{ 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  borderRadius: '8px', 
                  padding: '0.5rem 0.75rem',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>
            
            {/* Send Description Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.2rem' }}>
              <input 
                type="checkbox" 
                id="web-send-desc"
                checked={webSendDescription}
                onChange={e => setWebSendDescription(e.target.checked)}
                style={{ 
                  width: '18px', 
                  height: '18px', 
                  cursor: 'pointer',
                  accentColor: 'var(--color-primary)'
                }}
              />
              <label htmlFor="web-send-desc" style={{ fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
                Send Description
              </label>

              {items.some(it => selectedItems.includes(it.id) && (it.real_image_count || 0) > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
                  <input 
                    type="checkbox" 
                    id="web-share-real"
                    checked={webShareRealImages}
                    onChange={e => setWebShareRealImages(e.target.checked)}
                    style={{ 
                      width: '18px', 
                      height: '18px', 
                      cursor: 'pointer',
                      accentColor: '#3b82f6'
                    }}
                  />
                  <label htmlFor="web-share-real" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#60a5fa', cursor: 'pointer', userSelect: 'none' }}>
                    📷 Download / Share RAW Real Photos (Watermarked)
                  </label>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap', marginTop: '1.2rem' }}>
              <button 
                type="button" 
                onClick={handleCopyDetails}
                className="btn"
                style={{ 
                  padding: '0.5rem 1rem', 
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {copiedText ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} />}
                {copiedText ? 'Copied!' : 'Copy Text'}
              </button>
              
              <button 
                type="button" 
                onClick={handleDownloadSelectedImages}
                className="btn"
                style={{ 
                  padding: '0.5rem 1rem', 
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <Download size={16} />
                Download Images
              </button>
              
              <button 
                type="button" 
                onClick={handleShareWhatsAppWeb}
                className="btn"
                style={{ 
                  padding: '0.5rem 1.2rem', 
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  border: '1px solid #25D366',
                  borderRadius: '8px',
                  background: '#25D366', // WhatsApp Green
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <Share2 size={16} />
                Share via WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RAW Real Images Management Modal */}
      {realImagesModalItem && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>📷 RAW Real Photos: {realImagesModalItem.sku_id}</h3>
              <button className="close-btn" onClick={() => setRealImagesModalItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--glass-border)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Upload Additional RAW Real Photos (Watermark auto-applied):
                </label>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*"
                  onChange={handleUploadRealImagesToExistingItem}
                  disabled={uploadingRealImages}
                  style={{ fontSize: '0.85rem' }}
                />
                {uploadingRealImages && <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.5rem' }}>Uploading & applying watermark...</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
                {realImagesList.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                    No RAW real photos uploaded for this design yet.
                  </p>
                ) : (
                  realImagesList.map(img => (
                    <div key={img.id} style={{ position: 'relative', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                      <a 
                        href={img.watermarked_path}
                        download={`real_${realImagesModalItem.sku_id}_${img.id}.jpg`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.7)', color: '#ffffff', borderRadius: '50%', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Download Watermarked Photo"
                      >
                        <Download size={12} />
                      </a>
                      {(user?.role === 'superadmin' || user?.role === 'manager') && (
                        <button 
                          onClick={() => handleDeleteRealImage(img.id)}
                          style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', color: '#ef4444', border: 'none', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}
                          title="Delete photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
