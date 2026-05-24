import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderPlus, 
  Upload, 
  Trash2, 
  Search, 
  Filter, 
  Image as ImageIcon,
  CheckCircle,
  XCircle
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
  description?: string;
  material?: string;
  created_at: string;
  category_name: string;
  sets_count: number;
  total_pieces: number;
  is_available: boolean;
}

interface CatalogsProps {
  token: string;
}

export default function Catalogs({ token }: CatalogsProps) {
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  // Filters/Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCatId, setFilterCatId] = useState('');

  // Messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategories();
    fetchSKUs();
  }, []);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
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
    formData.append('image', selectedFile);

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
        // Add new item to state
        setItems([data, ...items]);
        
        // Reset form
        setSkuId('');
        setPiecesPerSet(4);
        setDescription('');
        setMaterial('');
        setSelectedFile(null);
        setFilePreview(null);
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

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = item.sku_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCatId === '' || item.category_id === parseInt(filterCatId);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1>Catalog & SKU Management</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Create folders and upload designs SKU-wise</p>
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
              categories.map(cat => (
                <div key={cat.id} className="flex-between" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <span style={{ fontWeight: 600 }}>{cat.name}</span>
                  <button 
                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
                    title="Delete folder and contents"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
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

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Uploading File...' : 'Upload Design'}
            </button>
          </form>
        </div>
      </div>

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
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Catalog items grid */}
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
            No SKU designs match your filters. Upload some designs or adjust filters!
          </div>
        ) : (
          <div className="catalog-grid">
            {filteredItems.map(item => (
              <div key={item.id} className="catalog-card fade-in">
                <div className="catalog-image-wrapper">
                  <img src={item.image_path} alt={item.sku_id} className="catalog-image" />
                  <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                    {item.is_available ? (
                      <span className="badge badge-success" title="Available">
                        <CheckCircle size={12} style={{ marginRight: '4px' }} />
                        Available
                      </span>
                    ) : (
                      <span className="badge badge-danger" title="Unavailable">
                        <XCircle size={12} style={{ marginRight: '4px' }} />
                        No Stock
                      </span>
                    )}
                  </div>
                </div>

                <div className="catalog-details">
                  <div className="flex-between">
                    <span className="sku-tag">{item.sku_id}</span>
                    <button 
                      onClick={() => handleDeleteSKU(item.id, item.sku_id)}
                      style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '2px' }}
                      title="Delete SKU Design"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <span className="folder-tag">{item.category_name}</span>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '0.5rem' }}>
                    <span>Sets: <strong>{item.sets_count}</strong> ({item.pieces_per_set} pc/set)</span>
                    <span>Qty: <strong>{item.total_pieces}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
