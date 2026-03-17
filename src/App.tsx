/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, 
  doc, query, orderBy, where, serverTimestamp, Timestamp,
  increment, writeBatch
} from 'firebase/firestore';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  User, signOut, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, updateProfile 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// --- Types ---

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  authorId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  img: string;
  userId: string;
  stock: number;
}

enum View {
  DASHBOARD = 'dashboard',
  DOCUMENTATION = 'documentation',
  USERS = 'users',
  SETTINGS = 'settings',
  PDV = 'pdv',
  PRODUCTS = 'products',
  SALES = 'sales'
}

// --- Constants ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const CATEGORIES = ['PDV', 'Financeiro', 'Estoque', 'Relatórios', 'Geral'];
const PRODUCT_CATEGORIES = ['Comida', 'Bebidas', 'Sobremesas', 'Outros'];

const INITIAL_PRODUCTS = [
  { name: 'Hambúrguer Tech', price: 25.90, category: 'Comida', img: 'https://picsum.photos/seed/burger/400/400', stock: 50 },
  { name: 'Energético Neon', price: 12.50, category: 'Bebidas', img: 'https://picsum.photos/seed/energy/400/400', stock: 100 },
  { name: 'Batata Metálica', price: 15.00, category: 'Comida', img: 'https://picsum.photos/seed/fries/400/400', stock: 80 },
  { name: 'Refrigerante Glow', price: 8.00, category: 'Bebidas', img: 'https://picsum.photos/seed/soda/400/400', stock: 120 },
  { name: 'Sanduíche Cyber', price: 22.00, category: 'Comida', img: 'https://picsum.photos/seed/sandwich/400/400', stock: 40 },
  { name: 'Água Crystal', price: 5.00, category: 'Bebidas', img: 'https://picsum.photos/seed/water/400/400', stock: 200 },
  { name: 'Milkshake Quantum', price: 18.50, category: 'Sobremesas', img: 'https://picsum.photos/seed/shake/400/400', stock: 30 },
  { name: 'Pizza Pixel', price: 45.00, category: 'Comida', img: 'https://picsum.photos/seed/pizza/400/400', stock: 25 },
];

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.PDV);
  const [articles, setArticles] = useState<Article[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showTicket, setShowTicket] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  
  // Auth Form State
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Article Form State
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('PDV');

  // Product Form State
  const [showProductModal, setShowProductModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<{id?: string, name: string, price: number, category: string, img: string, stock: number}>({
    name: '',
    price: 0,
    category: 'Comida',
    img: '',
    stock: 0
  });

  // PDV State
  const [cart, setCart] = useState<{id: string, name: string, price: number, qty: number, img: string}[]>([]);
  const [pdvCategory, setPdvCategory] = useState('Todos');
  const [pdvQty, setPdvQty] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('Dinheiro');
  const [amountReceived, setAmountReceived] = useState<number | ''>('');
  const [discount, setDiscount] = useState<number | ''>('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [saleSuccess, setSaleSuccess] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Company Settings State
  const [companySettings, setCompanySettings] = useState({
    name: 'TONFOX SISTEMAS',
    address: 'Rua da Tecnologia, 1000 - Centro',
    cnpj: '00.000.000/0001-00',
    tel: '(11) 9999-9999'
  });

  // Theme Listener
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
  }, []);

  // Articles Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setArticles([]);
      return;
    }
    const q = query(
      collection(db, 'articles'), 
      where('authorId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setArticles(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Article)));
    }, (error) => {
      console.error('Articles Listener Error:', error);
    });
  }, [isAuthReady, user]);

  // Sales Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setSales([]);
      return;
    }
    const q = query(
      collection(db, 'sales'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Sales Listener Error:', error);
    });
  }, [isAuthReady, user]);

  // Products Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setProducts([]);
      return;
    }
    const q = query(
      collection(db, 'products'), 
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => {
      console.error('Products Listener Error:', error);
    });
  }, [isAuthReady, user]);

  // Seed Products if empty
  useEffect(() => {
    if (isAuthReady && user && products.length === 0) {
      const seed = async () => {
        for (const p of INITIAL_PRODUCTS) {
          await addDoc(collection(db, 'products'), { ...p, userId: user.uid });
        }
      };
      // Only seed if we've explicitly checked and it's empty
      // We use a small delay to avoid race conditions with the listener
      const timer = setTimeout(() => {
        if (products.length === 0) seed();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isAuthReady, user, products.length]);

  // Auth Handlers
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(res.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setCurrentView(View.DOCUMENTATION);
    setSelectedArticle(null);
    setIsEditing(false);
  };

  // Article Handlers
  const handleSaveArticle = async () => {
    if (!user || !editTitle.trim()) return;
    const path = 'articles';
    try {
      const data = {
        title: editTitle,
        content: editContent,
        category: editCategory,
        updatedAt: serverTimestamp()
      };
      if (selectedArticle) {
        await updateDoc(doc(db, path, selectedArticle.id), data);
      } else {
        await addDoc(collection(db, path), {
          ...data,
          authorId: user.uid,
          createdAt: serverTimestamp()
        });
      }
      setIsEditing(false);
      setSelectedArticle(null);
    } catch (error) {
      handleFirestoreError(error, selectedArticle ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const startNewArticle = () => {
    setSelectedArticle(null);
    setEditTitle('');
    setEditContent('');
    setEditCategory('PDV');
    setIsEditing(true);
  };

  const editArticle = (article: Article) => {
    setSelectedArticle(article);
    setEditTitle(article.title);
    setEditContent(article.content);
    setEditCategory(article.category);
    setIsEditing(true);
  };

  const handleDeleteArticle = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este artigo?')) return;
    const path = `articles/${id}`;
    try {
      await deleteDoc(doc(db, 'articles', id));
      if (selectedArticle?.id === id) {
        setSelectedArticle(null);
        setIsEditing(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  // Product Handlers
  const handleSaveProduct = async () => {
    if (!user || !productForm.name.trim()) return;
    const path = 'products';
    try {
      const data = {
        name: productForm.name,
        price: productForm.price,
        category: productForm.category,
        stock: productForm.stock || 0,
        img: productForm.img || `https://picsum.photos/seed/${productForm.name}/400/400`,
        userId: user.uid,
        updatedAt: serverTimestamp()
      };
      if (productForm.id) {
        await updateDoc(doc(db, path, productForm.id), data);
      } else {
        await addDoc(collection(db, path), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setShowProductModal(false);
    } catch (error) {
      handleFirestoreError(error, productForm.id ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const startNewProduct = () => {
    setProductForm({ name: '', price: 0, category: 'Comida', img: '', stock: 0 });
    setShowProductModal(true);
  };

  const editProduct = (product: Product) => {
    setProductForm({ 
      id: product.id, 
      name: product.name, 
      price: product.price, 
      category: product.category, 
      img: product.img,
      stock: product.stock || 0
    });
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDeleteProduct = async () => {
    if (!showDeleteConfirm) return;
    const id = showDeleteConfirm;
    const path = `products/${id}`;
    try {
      await deleteDoc(doc(db, 'products', id));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Erro ao deletar:', error);
      alert('Erro ao excluir produto. Verifique as permissões.');
      setShowDeleteConfirm(null);
    }
  };

  // Keyboard Shortcuts for PDV
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentView !== View.PDV) return;

      if (e.key === 'F9') {
        e.preventDefault();
        setCart([]);
      }
      if (e.key === 'F5') { e.preventDefault(); setPaymentMethod('Dinheiro'); }
      if (e.key === 'F6') { e.preventDefault(); setPaymentMethod('Crédito'); }
      if (e.key === 'F7') { e.preventDefault(); setPaymentMethod('Débito'); }
      if (e.key === 'F10') {
        e.preventDefault();
        if (cart.length > 0 && !isProcessingSale) {
          handleFinalizeSale();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, cart, isProcessingSale]);

  // PDV Handlers
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + pdvQty } : item);
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: pdvQty, img: product.img }];
    });
    setPdvQty(1); // Reset quantity after adding
    setTimeout(() => searchInputRef.current?.focus(), 10); // Keep focus on search for barcode scanners
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(item => item.id !== id));

  const handleFinalizeSale = async () => {
    if (cart.length === 0 || !user) return;
    setIsProcessingSale(true);
    const path = 'sales';
    try {
      const received = typeof amountReceived === 'number' ? amountReceived : cartTotal;
      const change = paymentMethod === 'Dinheiro' && received > cartTotal ? received - cartTotal : 0;
      const discountValue = typeof discount === 'number' ? discount : 0;

      const saleData = {
        userId: user.uid,
        items: cart,
        total: cartTotal,
        subtotal: subtotal,
        discount: discountValue,
        paymentMethod,
        amountReceived: received,
        change: change,
        createdAt: serverTimestamp()
      };
      // Save sale to Firestore
      const docRef = await addDoc(collection(db, path), saleData);
      
      // Deduct stock automatically using a batch write
      const batch = writeBatch(db);
      cart.forEach(item => {
        const productRef = doc(db, 'products', item.id);
        batch.update(productRef, { stock: increment(-item.qty) });
      });
      await batch.commit();
      
      setLastSale({ ...saleData, id: docRef.id, createdAt: new Date() });
      setSaleSuccess(true);
      setCart([]);
      setAmountReceived('');
      setDiscount('');
      setPaymentMethod('Dinheiro');
      setShowTicket(true);
      setTimeout(() => setSaleSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsProcessingSale(false);
    }
  };

  const handlePrint = useCallback(() => {
    const printContent = document.getElementById('ticket-print-content');
    if (!printContent) {
      console.error('Print content not found');
      window.print();
      return;
    }

    try {
      // Try iframe method first
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.id = 'print-iframe';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) throw new Error('Could not access iframe document');

      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(style => style.outerHTML)
        .join('');

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Imprimir Ticket</title>
            <meta charset="utf-8">
            ${styles}
            <style>
              @media print {
                @page { margin: 0; size: 80mm auto; }
                body { margin: 0; padding: 0; background: white !important; }
                .ticket-container { width: 80mm !important; margin: 0 !important; padding: 5mm !important; }
                .no-print { display: none !important; }
              }
              body { 
                background: white !important; 
                margin: 0; 
                padding: 20px; 
                display: flex; 
                justify-content: center;
                font-family: 'Courier New', Courier, monospace;
              }
              .ticket-container { width: 80mm; background: white; }
              * { color: black !important; }
            </style>
          </head>
          <body>
            <div class="ticket-container">
              ${printContent.innerHTML}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        const existingIframe = document.getElementById('print-iframe');
        if (existingIframe) document.body.removeChild(existingIframe);
      }, 10000);
    } catch (error) {
      console.error('Print error, falling back to new window:', error);
      // Fallback: Open in new window
      const printWindow = window.open('', '_blank', 'width=600,height=800');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>Ticket</title></head>
            <body onload="window.print();window.close()">
              <div style="font-family: monospace; width: 300px; margin: 0 auto;">
                ${printContent.innerHTML}
              </div>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    }
  }, []);

  // Auto-print when ticket modal opens
  useEffect(() => {
    if (showTicket && lastSale) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [showTicket, lastSale, handlePrint]);

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const discountValue = typeof discount === 'number' ? discount : 0;
  const cartTotal = Math.max(0, subtotal - discountValue);
  const displayChange = (typeof amountReceived === 'number' ? amountReceived : 0) - cartTotal;

  if (!isAuthReady) return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center">
      <div className="size-12 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm glass-panel p-8 rounded-2xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="size-14 bg-primary/10 rounded-xl flex items-center justify-center mb-4 border border-primary/20">
              <span className="material-symbols-outlined text-primary text-3xl">terminal</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tighter uppercase">Tonfox Admin</h1>
            <p className="text-sm text-slate-500 mt-1 uppercase tracking-widest">Acesso Restrito</p>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {isSignUp && (
              <input 
                type="text" placeholder="Nome da Loja" value={displayName} onChange={e => setDisplayName(e.target.value)} required
                className="w-full bg-bg-dark/50 border border-border rounded-lg px-4 py-3 text-base text-white focus:border-primary outline-none transition-all"
              />
            )}
            <input 
              type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-bg-dark/50 border border-border rounded-lg px-4 py-3 text-base text-white focus:border-primary outline-none transition-all"
            />
            <input 
              type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-bg-dark/50 border border-border rounded-lg px-4 py-3 text-base text-white focus:border-primary outline-none transition-all"
            />
            {authError && <p className="text-red-500 text-xs font-bold uppercase tracking-tight">{authError}</p>}
            <button type="submit" className="w-full bg-primary text-black font-bold py-4 rounded-lg text-sm uppercase tracking-widest hover:brightness-110 transition-all neon-glow">
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
            <div className="relative flex justify-center text-xs uppercase font-bold"><span className="bg-surface px-2 text-slate-600">Ou</span></div>
          </div>

          <button onClick={handleGoogleLogin} className="w-full bg-bg-dark/50 text-white border border-border py-3 rounded-lg text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface transition-all">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Google Login
          </button>

          <p className="mt-8 text-xs text-center text-slate-500 uppercase tracking-wider">
            {isSignUp ? 'Já tem conta?' : 'Novo por aqui?'} {' '}
            <button onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} className="text-primary font-bold hover:underline">
              {isSignUp ? 'Entrar' : 'Cadastrar'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-dark text-slate-300">
      {/* Header */}
      {currentView !== View.PDV && (
        <header className="h-16 border-b border-border bg-bg-dark/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3 text-primary">
              <span className="material-symbols-outlined text-3xl">terminal</span>
              <h2 className="text-lg font-bold uppercase tracking-tighter">Tonfox Admin</h2>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              {[View.DASHBOARD, View.DOCUMENTATION, View.PRODUCTS, View.USERS, View.SETTINGS, View.PDV].map(v => (
                <button 
                  key={v} onClick={() => setCurrentView(v)}
                  className={`text-sm font-bold uppercase tracking-widest transition-all pb-1 border-b-2 ${currentView === v ? 'text-primary border-primary' : 'text-slate-500 border-transparent hover:text-primary'}`}
                >
                  {v === View.DOCUMENTATION ? 'Documentação' : v === View.PRODUCTS ? 'Produtos' : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="size-10 rounded-lg border border-border flex items-center justify-center hover:bg-surface transition-all"
            >
              <span className="material-symbols-outlined text-xl">
                {isDarkMode ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white leading-none">{user.displayName || 'Usuário'}</p>
              <p className="text-[10px] text-primary uppercase tracking-tighter mt-1">Sessão Ativa</p>
            </div>
            <button onClick={handleLogout} className="size-10 rounded-full border border-primary/30 overflow-hidden hover:scale-105 transition-all">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}&background=162516&color=00ff00`} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
          </div>
        </header>
      )}

      <main className="flex-1 flex flex-row overflow-hidden">
        {currentView === View.DASHBOARD && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
            <div className="max-w-6xl mx-auto space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-panel p-8 rounded-3xl border border-border">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Artigos Criados</p>
                  <h3 className="text-4xl font-bold text-white tracking-tight">{articles.length}</h3>
                  <div className="mt-4 flex items-center gap-2 text-slate-500 text-sm font-bold">
                    Base de Conhecimento
                  </div>
                </div>
                <div className="glass-panel p-8 rounded-3xl border border-border">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Status Sistema</p>
                  <h3 className="text-4xl font-bold text-primary tracking-tight">Ativo</h3>
                  <div className="mt-4 flex items-center gap-2 text-slate-500 text-sm font-bold">
                    Terminal Online
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-panel p-8 rounded-3xl border border-border">
                  <h4 className="text-lg font-bold text-white uppercase tracking-widest mb-6">Vendas Recentes</h4>
                  <div className="space-y-4">
                    {sales.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-4">
                          <div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-lg">receipt_long</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white uppercase tracking-tight">Venda #{s.id.slice(0, 6)}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">{s.items.length} itens</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary font-mono">R$ {s.total.toFixed(2)}</p>
                          <span className="text-[10px] font-mono text-slate-600">
                            {s.createdAt?.toDate().toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                    {sales.length === 0 && (
                      <div className="text-center py-10 text-slate-700">
                        <p className="text-xs uppercase tracking-widest font-bold opacity-30">Nenhuma venda registrada</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="glass-panel p-8 rounded-3xl border border-border">
                  <h4 className="text-lg font-bold text-white uppercase tracking-widest mb-6">Acesso Rápido</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setCurrentView(View.PDV)} className="p-6 bg-surface/30 rounded-2xl border border-border hover:border-primary/40 transition-all text-left group">
                      <span className="material-symbols-outlined text-primary text-2xl mb-4 group-hover:scale-110 transition-transform">point_of_sale</span>
                      <p className="text-sm font-bold text-white uppercase tracking-widest">Abrir PDV</p>
                    </button>
                    <button onClick={() => setCurrentView(View.DOCUMENTATION)} className="p-6 bg-surface/30 rounded-2xl border border-border hover:border-primary/40 transition-all text-left group">
                      <span className="material-symbols-outlined text-primary text-2xl mb-4 group-hover:scale-110 transition-transform">edit_document</span>
                      <p className="text-sm font-bold text-white uppercase tracking-widest">Novo Artigo</p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === View.DOCUMENTATION && (
          <>
            {/* Sidebar */}
            <aside className="w-64 lg:w-96 border-r border-border flex flex-col bg-bg-dark shrink-0">
              <div className="p-6 border-b border-border flex justify-between items-center bg-surface/10">
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Base de Conhecimento</span>
                <button onClick={startNewArticle} className="text-primary hover:scale-110 transition-transform flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20">
                  <span className="material-symbols-outlined text-xl">add</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Novo</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-8">
                {CATEGORIES.map(cat => (
                  <div key={cat} className="space-y-3">
                    <p className="px-4 py-1 text-xs font-bold text-slate-600 uppercase tracking-[0.3em] border-l-2 border-primary/30 ml-2">{cat}</p>
                    {articles.filter(a => a.category === cat).map(article => (
                      <div key={article.id} className="group relative">
                        <button 
                          onClick={() => editArticle(article)}
                          className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all ${selectedArticle?.id === article.id ? 'bg-primary/10 text-primary border border-primary/30 shadow-[0_0_20px_rgba(0,255,0,0.05)]' : 'hover:bg-surface/50 text-slate-400 border border-transparent'}`}
                        >
                          <span className="material-symbols-outlined text-xl">description</span>
                          <span className="text-base font-bold truncate uppercase tracking-tight flex-1">{article.title}</span>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteArticle(article.id); }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-500 p-2 transition-all"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </aside>

            {/* Content Area */}
            <section className="flex-1 flex flex-col bg-bg-dark overflow-hidden">
              <div className="h-24 border-b border-border flex items-center justify-between px-10 bg-surface/10 shrink-0">
                <div>
                  <h1 className="text-2xl font-bold text-white flex items-center gap-4 tracking-tight">
                    Editor de Documentação
                    <span className="text-xs font-mono text-primary/40 bg-primary/5 px-3 py-1 rounded border border-primary/10">#ADMIN_V2</span>
                  </h1>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Gerenciamento de base de conhecimento</p>
                </div>
                <div className="flex items-center gap-4">
                  {isEditing && (
                    <>
                      <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white px-4 py-2 text-xs font-bold uppercase tracking-widest">
                        Cancelar
                      </button>
                      <button onClick={handleSaveArticle} className="bg-primary text-black px-10 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest hover:brightness-110 transition-all neon-glow">
                        Salvar Alterações
                      </button>
                    </>
                  )}
                  {selectedArticle && !isEditing && (
                    <div className="flex items-center gap-4">
                      <button onClick={() => handleDeleteArticle(selectedArticle.id)} className="text-red-500/50 hover:text-red-500 px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors">
                        Excluir
                      </button>
                      <button onClick={() => setIsEditing(true)} className="bg-surface border border-border text-white px-8 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-border transition-all">
                        Editar Artigo
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-12">
                <div className="max-w-5xl mx-auto">
                  {isEditing ? (
                    <div className="space-y-12">
                      <div className="grid grid-cols-3 gap-10">
                        <div className="col-span-2 space-y-4">
                          <label className="text-sm font-bold text-slate-500 uppercase tracking-widest">Título do Artigo</label>
                          <input 
                            value={editTitle} onChange={e => setEditTitle(e.target.value)}
                            className="w-full bg-surface/50 border border-border rounded-2xl px-6 py-5 text-xl font-bold focus:border-primary text-white outline-none transition-all" 
                            placeholder="Ex: Configuração de Impressora..." 
                          />
                        </div>
                        <div className="space-y-4">
                          <label className="text-sm font-bold text-slate-500 uppercase tracking-widest">Categoria</label>
                          <select 
                            value={editCategory} onChange={e => setEditCategory(e.target.value)}
                            className="w-full bg-surface/50 border border-border rounded-2xl px-6 py-5 text-sm font-bold uppercase tracking-widest focus:border-primary text-white outline-none transition-all"
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-sm font-bold text-slate-500 uppercase tracking-widest">Conteúdo (Markdown)</label>
                        <textarea 
                          value={editContent} onChange={e => setEditContent(e.target.value)}
                          className="w-full h-[700px] bg-surface/30 border border-border rounded-3xl p-10 text-lg text-slate-300 focus:border-primary outline-none resize-none font-mono leading-relaxed transition-all" 
                          placeholder="Digite o conteúdo aqui..."
                        />
                      </div>
                    </div>
                  ) : selectedArticle ? (
                    <motion.article initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="prose prose-invert max-w-none">
                      <div className="flex items-center gap-6 mb-12">
                        <span className="text-sm font-bold uppercase tracking-[0.3em] bg-primary/10 text-primary px-6 py-2 rounded-full border border-primary/20">{selectedArticle.category}</span>
                        <span className="text-xs text-slate-600 font-mono uppercase tracking-widest">Atualizado em {selectedArticle.updatedAt?.toDate().toLocaleString()}</span>
                      </div>
                      <h1 className="text-6xl font-bold text-white tracking-tighter mb-12 uppercase">{selectedArticle.title}</h1>
                      <div className="text-slate-300 leading-relaxed text-xl space-y-6">
                        <Markdown>{selectedArticle.content}</Markdown>
                      </div>
                    </motion.article>
                  ) : (
                    <div className="h-[60vh] flex flex-col items-center justify-center text-slate-700">
                      <span className="material-symbols-outlined text-9xl mb-8 opacity-10">terminal</span>
                      <p className="text-lg uppercase tracking-[0.5em] font-bold opacity-30">Selecione um documento no terminal</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {currentView === View.PDV && (
          <div className="flex-1 flex flex-col bg-[#008080] overflow-hidden font-mono">
            {/* PDV Header */}
            <div className="bg-[#004d40] px-6 py-3 flex justify-between items-center border-b-4 border-[#00332c] shrink-0">
              <div className="flex items-center gap-4">
                <div className="text-white">
                  <p className="text-[10px] font-bold opacity-50 uppercase leading-none">Terminal</p>
                  <p className="text-sm font-bold">CAIXA_01</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setCurrentView(View.DASHBOARD)}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-white/20"
                >
                  <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
                  <span className="text-xs font-bold uppercase tracking-widest">Painel Admin</span>
                </button>
                <div className="h-8 w-px bg-white/20 mx-2"></div>
                <div className="text-right text-white">
                  <p className="text-[10px] font-bold opacity-50 uppercase leading-none">Operador</p>
                  <p className="text-sm font-bold uppercase">{user?.displayName || 'ADMINISTRADOR'}</p>
                </div>
                <div className="bg-emerald-500/20 border border-emerald-500/50 px-4 py-1 rounded-full flex items-center gap-2">
                  <div className="size-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Sistema Online</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex p-3 gap-3 overflow-hidden">
              {/* Column 1: Info, Search and Payments */}
              <div className="w-[320px] flex flex-col gap-2 shrink-0 overflow-y-auto custom-scrollbar pr-1">
                
                {/* Payment Panel */}
                <div className="bg-white rounded-lg border-4 border-[#006666] flex flex-col overflow-hidden shadow-2xl">
                  <div className="bg-[#006666] p-2 flex justify-between items-center">
                    <span className="text-white font-bold text-sm uppercase tracking-widest">Total</span>
                    <span className="text-white font-bold text-2xl">R$ {cartTotal.toFixed(2)}</span>
                  </div>
                  
                  <div className="p-2 grid grid-cols-1 gap-1 bg-slate-100">
                    <button onClick={() => setPaymentMethod('Dinheiro')} className={`flex justify-between items-center px-2 py-1 border-2 rounded shadow-sm transition-colors ${paymentMethod === 'Dinheiro' ? 'bg-[#008080] border-[#008080] text-white' : 'bg-white border-[#008080] text-[#008080] hover:bg-slate-50'}`}>
                      <span className="font-bold text-[9px] uppercase">Dinheiro (F5)</span>
                      <span className={`font-bold text-lg ${paymentMethod === 'Dinheiro' ? 'text-white' : 'text-slate-900'}`}>R$ {paymentMethod === 'Dinheiro' ? cartTotal.toFixed(2) : '0,00'}</span>
                    </button>
                    <button onClick={() => setPaymentMethod('Crédito')} className={`flex justify-between items-center px-2 py-1 border-2 rounded shadow-sm transition-colors ${paymentMethod === 'Crédito' ? 'bg-[#008080] border-[#008080] text-white' : 'bg-white border-[#008080] text-[#008080] hover:bg-slate-50'}`}>
                      <span className="font-bold text-[9px] uppercase">Crédito (F6)</span>
                      <span className={`font-bold text-lg ${paymentMethod === 'Crédito' ? 'text-white' : 'text-slate-900'}`}>R$ {paymentMethod === 'Crédito' ? cartTotal.toFixed(2) : '0,00'}</span>
                    </button>
                    <button onClick={() => setPaymentMethod('Débito')} className={`flex justify-between items-center px-2 py-1 border-2 rounded shadow-sm transition-colors ${paymentMethod === 'Débito' ? 'bg-[#008080] border-[#008080] text-white' : 'bg-white border-[#008080] text-[#008080] hover:bg-slate-50'}`}>
                      <span className="font-bold text-[9px] uppercase">Débito (F7)</span>
                      <span className={`font-bold text-lg ${paymentMethod === 'Débito' ? 'text-white' : 'text-slate-900'}`}>R$ {paymentMethod === 'Débito' ? cartTotal.toFixed(2) : '0,00'}</span>
                    </button>
                  </div>

                  <div className="p-2 grid grid-cols-1 gap-2 bg-white border-t-2 border-[#006666]">
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-[#008080] uppercase opacity-70 tracking-widest">Quantidade a Adicionar</p>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setPdvQty(Math.max(1, pdvQty - 1))}
                          className="size-8 bg-[#008080] text-white rounded font-black text-lg hover:bg-[#004d40] active:scale-95 transition-all shadow-sm"
                        >
                          -
                        </button>
                        <input 
                          type="number"
                          min="1"
                          value={pdvQty}
                          onChange={(e) => setPdvQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="flex-1 bg-[#008080] text-white h-8 text-center font-black rounded text-sm shadow-inner outline-none focus:ring-1 focus:ring-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button 
                          onClick={() => setPdvQty(pdvQty + 1)}
                          className="size-8 bg-[#008080] text-white rounded font-black text-lg hover:bg-[#004d40] active:scale-95 transition-all shadow-sm"
                        >
                          +
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {[1, 2, 5, 10].map(n => (
                          <button 
                            key={n}
                            onClick={() => setPdvQty(n)}
                            className={`py-1 rounded text-[9px] font-bold transition-all border ${pdvQty === n ? 'bg-[#008080] text-white border-[#008080]' : 'bg-slate-100 text-[#008080] border-slate-200 hover:bg-slate-200'}`}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-2 grid grid-cols-2 gap-2 bg-white border-t-2 border-[#006666]">
                    <div className="space-y-0">
                      <p className="text-[8px] font-bold text-[#008080] uppercase opacity-70">Pagamento</p>
                      <div className="bg-[#008080] text-white p-1.5 font-bold text-center rounded text-[10px] uppercase">{paymentMethod}</div>
                    </div>
                    <div className="space-y-0">
                      <p className="text-[8px] font-bold text-[#008080] uppercase opacity-70">Desconto R$</p>
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value ? parseFloat(e.target.value) : '')}
                        placeholder="0.00"
                        className="w-full bg-slate-100 text-[#008080] p-1.5 font-bold text-right rounded text-[10px] outline-none focus:ring-1 focus:ring-[#008080] placeholder:text-[#008080]/50"
                      />
                    </div>
                    <div className="space-y-0">
                      <p className="text-[8px] font-bold text-[#008080] uppercase opacity-70">Recebido</p>
                      {paymentMethod === 'Dinheiro' ? (
                        <input 
                          type="number"
                          min="0"
                          step="0.01"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value ? parseFloat(e.target.value) : '')}
                          placeholder={cartTotal.toFixed(2)}
                          className="w-full bg-[#008080] text-white p-1.5 font-bold text-right rounded text-[10px] outline-none focus:ring-1 focus:ring-white/50 placeholder:text-white/50"
                        />
                      ) : (
                        <div className="bg-[#008080] text-white p-1.5 font-bold text-right rounded text-[10px]">R$ {cartTotal.toFixed(2)}</div>
                      )}
                    </div>
                    <div className="space-y-0">
                      <p className="text-[8px] font-bold text-[#008080] uppercase opacity-70">Troco</p>
                      <div className={`p-1.5 font-bold text-right rounded text-[10px] ${paymentMethod === 'Dinheiro' && displayChange > 0 ? 'bg-emerald-500 text-white animate-pulse' : 'bg-[#008080] text-white'}`}>
                        R$ {paymentMethod === 'Dinheiro' && displayChange > 0 ? displayChange.toFixed(2) : '0.00'}
                      </div>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-200 flex gap-1.5">
                    <button onClick={() => setCurrentView(View.DASHBOARD)} className="flex-1 bg-white border border-[#008080] text-[#008080] py-1.5 font-bold text-[9px] rounded hover:bg-[#008080] hover:text-white transition-all uppercase tracking-widest">Voltar</button>
                    <button onClick={() => setCart([])} className="flex-1 bg-red-600 text-white py-1.5 font-bold text-[9px] rounded hover:bg-red-700 transition-all uppercase tracking-widest">Limpar</button>
                    <button 
                      onClick={handleFinalizeSale}
                      disabled={cart.length === 0 || isProcessingSale}
                      className={`flex-1 py-1.5 font-bold text-[9px] rounded transition-all uppercase tracking-widest disabled:opacity-50 ${saleSuccess ? 'bg-white text-emerald-600 border border-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                      {isProcessingSale ? '...' : (saleSuccess ? 'OK!' : 'Pagar')}
                    </button>
                  </div>
                </div>

                {/* Info Panel */}
                <div className="bg-white rounded-lg border-2 border-[#006666] flex flex-col overflow-hidden shadow-xl">
                  <div className="bg-[#006666] p-1">
                    <span className="text-white font-bold text-[8px] uppercase tracking-[0.2em]">Info Venda</span>
                  </div>
                  <div className="p-2 space-y-1 text-[9px]">
                    <div className="flex justify-between border-b border-slate-100 pb-0.5">
                      <span className="font-bold text-slate-400 uppercase">Empresa</span>
                      <span className="font-bold text-slate-800 truncate ml-2">TONFOX SISTEMAS</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-400 uppercase">Venda Nº</span>
                      <span className="font-bold text-slate-800">#{Math.floor(Math.random() * 100000).toString().padStart(6, '0')}</span>
                    </div>
                  </div>
                </div>

                {/* Product Search Input */}
                <div className="bg-white rounded-lg border-2 border-[#006666] p-3 shadow-xl">
                  <p className="text-[8px] font-bold text-[#008080] uppercase mb-1 tracking-widest">Pesquisar Produto</p>
                  <div className="relative">
                    <input 
                      ref={searchInputRef}
                      autoFocus
                      type="text"
                      placeholder="DIGITE..."
                      className="w-full bg-slate-100 border border-[#008080] p-2 font-bold text-base outline-none focus:bg-white text-slate-900 uppercase"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.toLowerCase();
                          const found = products.find(p => p.name.toLowerCase().includes(val));
                          if (found) {
                            addToCart(found);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#008080] text-white px-2 py-1 rounded text-[10px] font-bold">ENTER</div>
                  </div>
                </div>

              </div>

              {/* Column 2: Quick Selection (Product Grid) */}
              <div className="flex-1 bg-white rounded-lg border-4 border-[#006666] flex flex-col overflow-hidden shadow-2xl">
                <div className="bg-[#006666] p-3 flex justify-between items-center">
                  <span className="text-white font-bold text-sm uppercase tracking-widest">Seleção Rápida</span>
                  <div className="flex gap-1">
                    {['Todos', ...PRODUCT_CATEGORIES].map(cat => (
                      <button 
                        key={cat} 
                        onClick={() => setPdvCategory(cat)}
                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-colors ${pdvCategory === cat ? 'bg-white text-[#006666]' : 'bg-white/10 text-white hover:bg-white/20'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 p-3 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto custom-scrollbar bg-slate-50 content-start auto-rows-max">
                  {products
                    .filter(p => pdvCategory === 'Todos' || p.category === pdvCategory)
                    .map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => addToCart(p)}
                        className="bg-white border-2 border-slate-200 p-3 rounded-xl hover:border-[#008080] hover:shadow-lg transition-all flex flex-col items-center text-center group relative overflow-hidden"
                      >
                        <img src={p.img} alt={p.name} className="w-full aspect-square object-cover rounded-lg mb-2 group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                        <p className="text-xs font-bold text-slate-800 uppercase leading-tight h-8 overflow-hidden mb-2">{p.name}</p>
                        <div className="mt-auto bg-slate-50 w-full py-1.5 rounded-md border border-slate-100">
                          <p className="text-sm font-black text-[#008080]">R$ {p.price.toFixed(2)}</p>
                        </div>
                        <div className="absolute inset-0 bg-[#008080]/0 group-active:bg-[#008080]/10 transition-colors"></div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Column 3: Item List (Cart) */}
              <div className="w-[440px] bg-white rounded-lg border-4 border-[#006666] flex flex-col overflow-hidden shadow-2xl shrink-0">
                <div className="bg-[#006666] p-4 flex justify-between items-center">
                  <span className="text-white font-bold text-xl uppercase tracking-widest">Itens da Venda</span>
                  <span className="text-white/50 font-bold text-xs">{cart.length} ITENS NO CARRINHO</span>
                </div>
                
                {/* Table Header */}
                <div className="grid grid-cols-12 bg-slate-200 p-3 border-b-2 border-[#008080] text-[10px] font-bold text-[#008080] uppercase tracking-wider">
                  <div className="col-span-1">Nº</div>
                  <div className="col-span-5">Produto</div>
                  <div className="col-span-3 text-center">Qtd</div>
                  <div className="col-span-3 text-right">Total</div>
                </div>

                {/* Table Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8fdfd]">
                  {cart.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-12 p-3 border-b border-slate-100 text-xs font-bold text-slate-800 hover:bg-[#e0f2f1] transition-colors items-center">
                      <div className="col-span-1 text-slate-400 text-[10px]">{String(idx + 1).padStart(2, '0')}</div>
                      <div className="col-span-5 uppercase truncate pr-2" title={item.name}>{item.name}</div>
                      <div className="col-span-3 flex items-center justify-center gap-2">
                        <button onClick={() => updateCartQty(item.id, -1)} className="size-6 bg-slate-200 rounded flex items-center justify-center hover:bg-red-100 hover:text-red-600 transition-colors text-lg leading-none shadow-sm">-</button>
                        <span className="w-6 text-center text-sm">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="size-6 bg-slate-200 rounded flex items-center justify-center hover:bg-emerald-100 hover:text-emerald-600 transition-colors text-lg leading-none shadow-sm">+</button>
                      </div>
                      <div className="col-span-3 text-right text-[#008080] flex items-center justify-end gap-2 text-sm">
                        R$ {(item.price * item.qty).toFixed(2)}
                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-40">
                      <span className="material-symbols-outlined text-9xl opacity-10 mb-4">barcode_scanner</span>
                      <p className="text-sm font-bold uppercase tracking-[0.8em] opacity-20">Aguardando Produtos</p>
                    </div>
                  )}
                </div>

                {/* Table Footer */}
                <div className="bg-[#b2dfdb] p-4 border-t-4 border-[#006666] flex justify-between items-center shrink-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between w-48 text-xs font-bold text-[#004d40] opacity-60">
                      <span>SUBTOTAL:</span>
                      <span>R$ {cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between w-48 text-xs font-bold text-[#004d40] opacity-60">
                      <span>DESCONTOS:</span>
                      <span>R$ 0,00</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-[#004d40] uppercase tracking-widest mb-0.5">Total a Pagar</p>
                    <p className="text-4xl font-black text-[#004d40] tracking-tighter drop-shadow-sm leading-none">R$ {cartTotal.toFixed(2)}</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {currentView === View.SALES && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50">
            <div className="max-w-6xl mx-auto h-full flex flex-col">
              <div className="flex justify-between items-center mb-10 shrink-0">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight uppercase">Histórico de Vendas</h2>
                  <p className="text-slate-500 text-sm uppercase tracking-widest mt-1">Acompanhe todas as vendas realizadas no PDV</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Data/Hora</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Itens</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Pagamento</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Total</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sales.map(sale => (
                        <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-sm text-slate-800">
                            {sale.createdAt?.toDate ? sale.createdAt.toDate().toLocaleString() : new Date(sale.createdAt).toLocaleString()}
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            {sale.items?.length || 0} itens
                          </td>
                          <td className="p-4 text-sm text-slate-600">
                            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold uppercase">
                              {sale.paymentMethod || 'Dinheiro'}
                            </span>
                          </td>
                          <td className="p-4 text-sm font-bold text-emerald-600 text-right">
                            R$ {sale.total.toFixed(2)}
                          </td>
                          <td className="p-4 text-sm text-center">
                            <button 
                              onClick={() => {
                                setLastSale(sale);
                                setShowTicket(true);
                              }}
                              className="text-emerald-600 hover:text-emerald-700 font-bold text-xs uppercase tracking-widest px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
                            >
                              Ver Recibo
                            </button>
                          </td>
                        </tr>
                      ))}
                      {sales.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500 uppercase tracking-widest text-sm">Nenhuma venda registrada ainda.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === View.PRODUCTS && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight uppercase">Gestão de Mercadorias</h2>
                  <p className="text-slate-500 text-sm uppercase tracking-widest mt-1">Configure seus produtos e preços</p>
                </div>
                <button 
                  onClick={startNewProduct}
                  className="bg-primary text-black font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all shadow-lg uppercase text-xs tracking-widest"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  Novo Produto
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
                    <div className="h-40 relative overflow-hidden">
                      <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                      <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-slate-900 uppercase tracking-widest border border-slate-200">
                        {p.category}
                      </div>
                    </div>
                    <div className="p-5">
                      <h4 className="font-bold text-slate-900 uppercase tracking-tight mb-1 truncate">{p.name}</h4>
                      <div className="flex justify-between items-end mb-4">
                        <p className="text-2xl font-black text-primary tracking-tighter">R$ {p.price.toFixed(2)}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Estoque: <span className="text-slate-900">{p.stock || 0}</span></p>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => editProduct(p)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-200 transition-all">Editar</button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="size-10 bg-red-50 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 transition-all">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentView === View.SETTINGS && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50">
            <div className="max-w-4xl mx-auto">
              <div className="mb-10">
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight uppercase">Configurações do Sistema</h2>
                <p className="text-slate-500 text-sm uppercase tracking-widest mt-1">Personalize as informações da sua empresa</p>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
                <div className="bg-slate-900 p-6">
                  <h3 className="text-white font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined">business</span>
                    Dados do Estabelecimento
                  </h3>
                </div>
                <div className="p-10 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Empresa</label>
                      <input 
                        type="text" 
                        value={companySettings.name}
                        onChange={e => setCompanySettings({...companySettings, name: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CNPJ</label>
                      <input 
                        type="text" 
                        value={companySettings.cnpj}
                        onChange={e => setCompanySettings({...companySettings, cnpj: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                      <input 
                        type="text" 
                        value={companySettings.address}
                        onChange={e => setCompanySettings({...companySettings, address: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                      <input 
                        type="text" 
                        value={companySettings.tel}
                        onChange={e => setCompanySettings({...companySettings, tel: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex justify-end">
                    <button 
                      onClick={() => {
                        alert('Configurações salvas com sucesso!');
                        setCurrentView(View.DASHBOARD);
                      }}
                      className="bg-primary text-black font-bold px-10 py-4 rounded-2xl hover:brightness-110 transition-all shadow-lg uppercase text-xs tracking-widest neon-glow"
                    >
                      Salvar Configurações
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-10 p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4">
                <span className="material-symbols-outlined text-blue-500">info</span>
                <div className="text-xs text-blue-700 leading-relaxed">
                  <p className="font-bold uppercase mb-1">Dica de Impressão</p>
                  <p>As informações acima aparecerão automaticamente no cabeçalho de todos os seus tickets de venda. Certifique-se de que o CNPJ e Telefone estejam corretos para seus clientes.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === View.USERS && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="size-20 bg-surface rounded-3xl flex items-center justify-center mx-auto mb-8 border border-border shadow-xl">
                <span className="material-symbols-outlined text-slate-600 text-4xl">construction</span>
              </div>
              <h3 className="text-base font-bold text-white uppercase tracking-widest mb-3">Módulo em Desenvolvimento</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-10">Estamos trabalhando para trazer esta funcionalidade para o ecossistema Tonfox em breve.</p>
              <button onClick={() => setCurrentView(View.DOCUMENTATION)} className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">
                Retornar ao Terminal
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {/* Product Modal */}
        {showProductModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="bg-slate-900 p-6 flex justify-between items-center">
                <h3 className="text-white font-bold uppercase tracking-widest text-sm">
                  {productForm.id ? 'Editar Produto' : 'Novo Produto'}
                </h3>
                <button onClick={() => setShowProductModal(false)} className="text-slate-400 hover:text-white transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome do Produto</label>
                  <input 
                    type="text" 
                    value={productForm.name}
                    onChange={e => setProductForm({...productForm, name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                    placeholder="Ex: Coca-Cola 350ml"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Preço (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={productForm.price}
                      onChange={e => setProductForm({...productForm, price: parseFloat(e.target.value)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Estoque Inicial</label>
                    <input 
                      type="number" 
                      value={productForm.stock}
                      onChange={e => setProductForm({...productForm, stock: parseInt(e.target.value)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                  <select 
                    value={productForm.category}
                    onChange={e => setProductForm({...productForm, category: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                  >
                    {PRODUCT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">URL da Imagem</label>
                  <input 
                    type="text" 
                    value={productForm.img}
                    onChange={e => setProductForm({...productForm, img: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                    placeholder="https://images.unsplash.com/..."
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowProductModal(false)}
                    className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveProduct}
                    className="flex-1 bg-primary text-black font-bold py-4 rounded-xl hover:brightness-110 transition-all shadow-lg uppercase text-[10px] tracking-widest"
                  >
                    Salvar Produto
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 p-8 text-center"
            >
              <div className="size-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-3xl">delete_forever</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 uppercase tracking-tight">Excluir Produto?</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">Esta ação não pode ser desfeita. O produto será removido permanentemente do seu catálogo.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDeleteProduct}
                  className="flex-1 bg-red-500 text-white font-bold py-4 rounded-xl hover:bg-red-600 transition-all shadow-lg uppercase text-[10px] tracking-widest"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Ticket Simulation Modal */}
        {showTicket && lastSale && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[110] flex items-center justify-center p-4 overflow-y-auto ticket-modal-backdrop"
          >
            <div className="max-w-md w-full py-10 no-print">
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                id="ticket-print-content"
                className="bg-white p-8 shadow-2xl relative"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >
                {/* Ticket Header */}
                <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
                  <h2 className="text-xl font-bold uppercase tracking-tighter text-black">{companySettings.name}</h2>
                  <p className="text-[10px] uppercase text-black">{companySettings.address}</p>
                  <p className="text-[10px] uppercase text-black">CNPJ: {companySettings.cnpj}</p>
                  <p className="text-[10px] uppercase text-black">Tel: {companySettings.tel}</p>
                </div>

                {/* Sale Info */}
                <div className="text-[10px] mb-4 space-y-1 text-black">
                  <div className="flex justify-between">
                    <span>DATA: {new Date(lastSale.createdAt).toLocaleDateString()}</span>
                    <span>HORA: {new Date(lastSale.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VENDA: #{lastSale.id.slice(-6).toUpperCase()}</span>
                    <span>OPERADOR: {user?.email?.split('@')[0].toUpperCase()}</span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border-b-2 border-dashed border-slate-300 pb-2 mb-2 text-black">
                  <div className="flex justify-between text-[10px] font-bold mb-2">
                    <span className="w-1/2">ITEM</span>
                    <span className="w-1/6 text-right">QTD</span>
                    <span className="w-1/3 text-right">VALOR</span>
                  </div>
                  {lastSale.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[10px] mb-1">
                      <span className="w-1/2 uppercase truncate">{item.name}</span>
                      <span className="w-1/6 text-right">{item.qty}</span>
                      <span className="w-1/3 text-right">R$ {(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="space-y-1 mb-6 text-black">
                  <div className="flex justify-between font-bold">
                    <span className="text-xs uppercase">Total Bruto</span>
                    <span className="text-xs">R$ {lastSale.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-xs uppercase">Desconto</span>
                    <span className="text-xs">R$ 0,00</span>
                  </div>
                  <div className="flex justify-between text-lg font-black border-t-2 border-black pt-2 mt-2">
                    <span className="uppercase">Total Líquido</span>
                    <span>R$ {lastSale.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment */}
                <div className="text-[10px] mb-8 text-black">
                  <div className="flex justify-between">
                    <span className="uppercase">Forma Pagto:</span>
                    <span className="font-bold uppercase">{lastSale.paymentMethod || 'Dinheiro'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase">Valor Recebido:</span>
                    <span className="font-bold">R$ {(lastSale.amountReceived || lastSale.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase">Troco:</span>
                    <span className="font-bold">R$ {(lastSale.change || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="text-center text-[10px] uppercase space-y-1 text-black opacity-80">
                  <p>Obrigado pela preferência!</p>
                  <p>Volte Sempre</p>
                </div>
              </motion.div>

              <div className="mt-8 flex gap-4 no-print">
                <button 
                  onClick={handlePrint} 
                  className="flex-1 bg-white text-slate-900 font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-all uppercase text-sm tracking-widest shadow-xl border-2 border-white/20"
                >
                  <span className="material-symbols-outlined text-2xl">print</span>
                  Imprimir Ticket
                </button>
                <button 
                  onClick={() => setShowTicket(false)} 
                  className="flex-1 bg-emerald-500 text-white font-bold py-5 rounded-2xl hover:bg-emerald-600 transition-all uppercase text-sm tracking-widest shadow-xl border-2 border-emerald-400/20"
                >
                  Nova Venda
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
