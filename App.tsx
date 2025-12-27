import React, { useState, useEffect, useMemo, useRef } from "react";
import html2canvas from "html2canvas";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  PlusIcon,
  TrashIcon,
  WalletIcon,
  CheckCircleIcon,
  SparklesIcon,
  FileTextIcon,
  EditIcon,
  ArrowLeftIcon,
  UsersIcon,
} from "./components/Icons";
import { Payment, Debt, AnalysisResult } from "./types";
import { analyzeDebtProgress } from "./services/geminiService";

// --- Constants & Helper Functions ---

const STORAGE_KEY_DEBTS = "debt_tracker_debts_v1";
const STORAGE_KEY_PAYMENTS = "debt_tracker_payments_v2";

// Legacy keys for migration
const LEGACY_STORAGE_SETTINGS = "debt_tracker_settings_v1";
const LEGACY_STORAGE_PAYMENTS = "debt_tracker_payments_v1";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (date: Date) => {
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).toUpperCase();
};

export default function App() {
  // --- Global State ---
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  // --- Modal States ---
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showEditTotalModal, setShowEditTotalModal] = useState(false);

  // --- Form States ---
  // New Debt Form
  const [newCreditor, setNewCreditor] = useState("");
  const [newTotalDebt, setNewTotalDebt] = useState("");

  // New Payment Form
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [newPaymentNote, setNewPaymentNote] = useState("");

  // Edit Total Form
  const [editingTotalAmount, setEditingTotalAmount] = useState("");

  // --- Feature States ---
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isGeneratingTicket, setIsGeneratingTicket] = useState(false);

  const ticketRef = useRef<HTMLDivElement>(null);

  // --- Initialization & Migration ---
  useEffect(() => {
    const storedDebts = localStorage.getItem(STORAGE_KEY_DEBTS);
    const storedPayments = localStorage.getItem(STORAGE_KEY_PAYMENTS);

    if (storedDebts) {
      setDebts(JSON.parse(storedDebts));
      if (storedPayments) {
        setPayments(JSON.parse(storedPayments));
      }
    } else {
      // Try Migration from V1
      const legacySettings = localStorage.getItem(LEGACY_STORAGE_SETTINGS);
      if (legacySettings) {
        try {
          const oldSettings = JSON.parse(legacySettings);
          if (oldSettings.isSet) {
            const newId = crypto.randomUUID();
            const migratedDebt: Debt = {
              id: newId,
              creditorName: oldSettings.creditorName,
              totalAmount: oldSettings.totalAmount,
              startDate: oldSettings.startDate,
            };
            
            const legacyPaymentsStr = localStorage.getItem(LEGACY_STORAGE_PAYMENTS);
            let migratedPayments: Payment[] = [];
            if (legacyPaymentsStr) {
               const oldPayments = JSON.parse(legacyPaymentsStr);
               migratedPayments = oldPayments.map((p: any) => ({
                 ...p,
                 debtId: newId // Assign new debt ID
               }));
            }

            setDebts([migratedDebt]);
            setPayments(migratedPayments);
            
            // Save immediately to new format
            localStorage.setItem(STORAGE_KEY_DEBTS, JSON.stringify([migratedDebt]));
            localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(migratedPayments));
            
            // Optional: Remove legacy? Maybe keep for safety.
          }
        } catch (e) {
          console.error("Migration failed", e);
        }
      }
    }
  }, []);

  // --- Persistence ---
  useEffect(() => {
    if (debts.length > 0) {
        localStorage.setItem(STORAGE_KEY_DEBTS, JSON.stringify(debts));
    } else if (localStorage.getItem(STORAGE_KEY_DEBTS)) {
         // Keep empty array if all deleted
         localStorage.setItem(STORAGE_KEY_DEBTS, JSON.stringify([]));
    }
  }, [debts]);

  useEffect(() => {
    if (payments.length > 0 || debts.length > 0) {
       localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(payments));
    }
  }, [payments, debts]);

  // --- Derived Data for Selected Debt ---
  const selectedDebt = useMemo(() => 
    debts.find(d => d.id === selectedDebtId) || null, 
  [debts, selectedDebtId]);

  const currentDebtPayments = useMemo(() => 
    payments.filter(p => p.debtId === selectedDebtId), 
  [payments, selectedDebtId]);

  const totalPaid = useMemo(
    () => currentDebtPayments.reduce((acc, curr) => acc + curr.amount, 0),
    [currentDebtPayments]
  );
  
  const remainingDebt = useMemo(() => {
    return selectedDebt ? Math.max(0, selectedDebt.totalAmount - totalPaid) : 0;
  }, [selectedDebt, totalPaid]);
  
  const progressPercentage = useMemo(() => {
    return selectedDebt ? Math.min(100, (totalPaid / selectedDebt.totalAmount) * 100) : 0;
  }, [selectedDebt, totalPaid]);

  const chartData = useMemo(() => {
    if (!selectedDebt) return [];
    // Sort payments by date
    const sortedPayments = [...currentDebtPayments].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let currentBalance = selectedDebt.totalAmount;
    const data = [
      {
        date: formatDate(selectedDebt.startDate),
        balance: selectedDebt.totalAmount,
        paid: 0,
      },
    ];

    sortedPayments.forEach((p) => {
      currentBalance -= p.amount;
      data.push({
        date: formatDate(p.date),
        balance: Math.max(0, currentBalance),
        paid: p.amount,
      });
    });

    return data;
  }, [currentDebtPayments, selectedDebt]);


  // --- Action Handlers ---

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCreditor || !newTotalDebt) return;

    const newDebt: Debt = {
      id: crypto.randomUUID(),
      creditorName: newCreditor,
      totalAmount: parseFloat(newTotalDebt),
      startDate: new Date().toISOString(),
    };

    setDebts(prev => [...prev, newDebt]);
    setNewCreditor("");
    setNewTotalDebt("");
    setShowAddDebtModal(false);
  };

  const handleDeleteDebt = (debtId: string) => {
    if (window.confirm("¿Estás seguro de eliminar esta deuda y todo su historial?")) {
        setDebts(prev => prev.filter(d => d.id !== debtId));
        setPayments(prev => prev.filter(p => p.debtId !== debtId));
        if (selectedDebtId === debtId) setSelectedDebtId(null);
    }
  }

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaymentAmount || !selectedDebtId) return;

    const payment: Payment = {
      id: crypto.randomUUID(),
      debtId: selectedDebtId,
      date: newPaymentDate,
      amount: parseFloat(newPaymentAmount),
      note: newPaymentNote,
    };

    setPayments((prev) => [...prev, payment]);
    setNewPaymentAmount("");
    setNewPaymentNote("");
    setNewPaymentDate(new Date().toISOString().split("T")[0]);
    setShowAddPaymentModal(false);
    setAiAnalysis(null); 
  };

  const handleDeletePayment = (id: string) => {
    if (window.confirm("¿Estás seguro de eliminar este pago?")) {
      setPayments((prev) => prev.filter((p) => p.id !== id));
      setAiAnalysis(null);
    }
  };

  const handleSaveTotal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt || !editingTotalAmount) return;
    
    const newTotal = parseFloat(editingTotalAmount);
    if (isNaN(newTotal) || newTotal <= 0) return;

    setDebts(prev => prev.map(d => 
        d.id === selectedDebt.id ? { ...d, totalAmount: newTotal } : d
    ));
    setShowEditTotalModal(false);
    setAiAnalysis(null);
  };

  const handleGetAnalysis = async () => {
    if (!selectedDebt) return;
    setLoadingAi(true);
    const result = await analyzeDebtProgress(selectedDebt, currentDebtPayments);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  const handleDownloadTicket = async () => {
    if (!ticketRef.current) return;
    setIsGeneratingTicket(true);
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const canvas = await html2canvas(ticketRef.current, {
            scale: 2,
            backgroundColor: "#f8fafc",
            logging: false,
        });
        const image = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = image;
        link.download = `ticket_${selectedDebt?.creditorName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.png`;
        link.click();
    } catch (error) {
        console.error("Error generating ticket:", error);
        alert("Error al generar el ticket.");
    } finally {
        setIsGeneratingTicket(false);
    }
  };

  const handleOpenEditTotal = () => {
    if (selectedDebt) {
      setEditingTotalAmount(selectedDebt.totalAmount.toString());
      setShowEditTotalModal(true);
    }
  };

  // --- Views ---

  // 1. Empty State (No Debts)
  if (debts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="bg-slate-900 shadow-xl shadow-black/50 rounded-2xl p-8 max-w-md w-full border border-slate-800 text-center">
            <div className="bg-blue-500/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/30">
              <UsersIcon className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Bienvenido a DebtTracker</h1>
            <p className="text-slate-400 mb-8">
              Lleva el control de tus deudas personales en un solo lugar. Comienza agregando tu primera deuda.
            </p>
            <button
              onClick={() => setShowAddDebtModal(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-900/50 transition-all border border-blue-500/50"
            >
              <PlusIcon className="w-5 h-5 inline-block mr-2" />
              Agregar Primera Deuda
            </button>

            {/* Modal for First Debt */}
            {showAddDebtModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-left">
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 w-full max-w-sm p-6 relative">
                     <button onClick={() => setShowAddDebtModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">✕</button>
                     <h3 className="text-xl font-bold text-white mb-6">Nueva Deuda</h3>
                     <form onSubmit={handleCreateDebt} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Acreedor (¿A quién le debes?)</label>
                            <input autoFocus type="text" value={newCreditor} onChange={e => setNewCreditor(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" placeholder="Ej. Juan Pérez" required />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Monto Total (€)</label>
                            <input type="number" step="0.01" min="0.01" value={newTotalDebt} onChange={e => setNewTotalDebt(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" placeholder="0.00" required />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg mt-2">Crear Registro</button>
                     </form>
                  </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  // 2. Dashboard List View
  if (!selectedDebtId) {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20">
            <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg">
                            <WalletIcon className="text-white w-5 h-5" />
                        </div>
                        <h1 className="font-bold text-lg tracking-tight text-white">DebtTracker</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Mis Deudas</h2>
                    <span className="text-sm bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700">{debts.length} activas</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {debts.map(debt => {
                         const debtPayments = payments.filter(p => p.debtId === debt.id);
                         const paid = debtPayments.reduce((acc, p) => acc + p.amount, 0);
                         const pct = Math.min(100, (paid / debt.totalAmount) * 100);
                         const remaining = Math.max(0, debt.totalAmount - paid);

                         return (
                             <div key={debt.id} 
                                  onClick={() => setSelectedDebtId(debt.id)}
                                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-blue-500/50 hover:bg-slate-850 transition-all cursor-pointer group relative overflow-hidden"
                             >
                                 <div className="flex justify-between items-start mb-4">
                                     <div>
                                         <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors">{debt.creditorName}</h3>
                                         <p className="text-xs text-slate-500">Iniciado el {formatDate(debt.startDate)}</p>
                                     </div>
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteDebt(debt.id); }}
                                        className="text-slate-600 hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors z-10"
                                     >
                                         <TrashIcon className="w-4 h-4" />
                                     </button>
                                 </div>
                                 
                                 <div className="flex justify-between items-end mb-2">
                                     <div className="text-sm text-slate-400">Restante</div>
                                     <div className="text-xl font-bold text-slate-200">{formatCurrency(remaining)}</div>
                                 </div>
                                 
                                 <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                     <div className="bg-blue-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                                 </div>
                                 <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                                     <span>{pct.toFixed(0)}% Pagado</span>
                                     <span>Total: {formatCurrency(debt.totalAmount)}</span>
                                 </div>
                             </div>
                         );
                    })}
                </div>
            </main>

            {/* FAB to add Debt */}
            <div className="fixed bottom-6 right-6">
                <button
                onClick={() => setShowAddDebtModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-full p-4 shadow-lg shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center border border-blue-400/20"
                >
                <PlusIcon className="w-6 h-6" />
                </button>
            </div>

            {/* Modal Add Debt (Reused) */}
             {showAddDebtModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
                     <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white">Nueva Deuda</h3>
                        <button onClick={() => setShowAddDebtModal(false)} className="text-slate-400 hover:text-white">✕</button>
                     </div>
                     <form onSubmit={handleCreateDebt} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Acreedor</label>
                            <input autoFocus type="text" value={newCreditor} onChange={e => setNewCreditor(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" placeholder="Nombre" required />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Monto (€)</label>
                            <input type="number" step="0.01" min="0.01" value={newTotalDebt} onChange={e => setNewTotalDebt(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none" placeholder="0.00" required />
                        </div>
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg mt-2">Guardar</button>
                     </form>
                  </div>
                </div>
            )}
        </div>
    );
  }

  // 3. Detail View (Selected Debt)
  const ticketDate = new Date(); // Current date for ticket generation

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 relative">
      {/* Header Detail */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setSelectedDebtId(null)}
                className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
             >
                 <ArrowLeftIcon className="w-5 h-5" />
             </button>
            <div className="flex flex-col">
                 <h1 className="font-bold text-sm text-slate-400 uppercase tracking-wide text-[10px]">Detalle de deuda</h1>
                 <span className="text-white font-semibold leading-none">{selectedDebt?.creditorName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button
              onClick={handleDownloadTicket}
              disabled={isGeneratingTicket}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-lg transition-all disabled:opacity-50"
            >
              <FileTextIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                  {isGeneratingTicket ? "..." : "Ticket"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Creditor Info & Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-6 text-white shadow-lg shadow-blue-900/40 border border-blue-600/30">
            <p className="text-blue-200 text-sm font-medium mb-1">
              Pendiente
            </p>
            <h2 className="text-4xl font-bold mb-2">
              {formatCurrency(remainingDebt)}
            </h2>
            <p className="text-blue-200 text-sm opacity-90">
              de un total de {formatCurrency(selectedDebt!.totalAmount)}
            </p>

            <div className="mt-6 bg-slate-900/40 rounded-full h-2.5 w-full overflow-hidden">
              <div
                className="bg-blue-400 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(96,165,250,0.5)]"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-blue-200 font-medium">
              <span>{progressPercentage.toFixed(1)}% Pagado</span>
              <span>{formatCurrency(totalPaid)} abonado</span>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 shadow-lg shadow-black/20 border border-slate-800 flex flex-col justify-between">
            <div>
              <h3 className="text-slate-400 font-medium text-sm mb-4 flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500" /> 
                Estado Actual
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-slate-400">Total Inicial</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{formatCurrency(selectedDebt!.totalAmount)}</span>
                    <button 
                        onClick={handleOpenEditTotal}
                        className="p-1 text-slate-600 hover:text-blue-400 transition-colors rounded hover:bg-slate-800"
                        title="Editar monto inicial"
                    >
                        <EditIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-slate-400">Total Abonado</span>
                  <span className="font-semibold text-emerald-400">
                    - {formatCurrency(totalPaid)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-white font-semibold">Pendiente</span>
                  <span className="font-bold text-rose-500 text-lg">
                    {formatCurrency(remainingDebt)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* AI Advisor Section */}
            <div className="mt-6 pt-4 border-t border-slate-800">
                {!aiAnalysis ? (
                    <button 
                        onClick={handleGetAnalysis}
                        disabled={loadingAi}
                        className="w-full flex items-center justify-center gap-2 text-sm text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 py-2.5 rounded-lg transition-colors"
                    >
                        {loadingAi ? (
                            <span className="animate-pulse">Analizando...</span>
                        ) : (
                            <>
                                <SparklesIcon className="w-4 h-4" />
                                Obtener consejo inteligente
                            </>
                        )}
                    </button>
                ) : (
                    <div className={`text-sm rounded-lg p-3 border ${
                        aiAnalysis.tone === 'positive' ? 'bg-emerald-950/30 border-emerald-900 text-emerald-200' :
                        aiAnalysis.tone === 'concerned' ? 'bg-amber-950/30 border-amber-900 text-amber-200' :
                        'bg-slate-800 border-slate-700 text-slate-300'
                    }`}>
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-xs uppercase tracking-wider opacity-70">Análisis</span>
                            <button onClick={() => setAiAnalysis(null)} className="text-xs hover:text-white opacity-50 transition-colors">Cerrar</button>
                        </div>
                        <p className="mb-2 leading-relaxed opacity-90">{aiAnalysis.message}</p>
                        {aiAnalysis.estimatedCompletion && (
                            <p className="text-xs font-semibold mt-1 opacity-70 border-t border-white/10 pt-1">
                                📅 {aiAnalysis.estimatedCompletion}
                            </p>
                        )}
                    </div>
                )}
            </div>
          </div>
        </div>

        {/* Chart Section */}
        {currentDebtPayments.length > 0 && (
          <div className="bg-slate-900 rounded-2xl p-6 shadow-lg shadow-black/20 border border-slate-800 h-80">
            <h3 className="text-slate-200 font-semibold mb-6">
              Historial de Balance
            </h3>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: "#94a3b8", fontSize: 12 }} 
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis 
                    tick={{ fill: "#94a3b8", fontSize: 12 }} 
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `€${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        borderColor: '#334155', 
                        color: '#f1f5f9',
                        borderRadius: '8px', 
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' 
                    }}
                    itemStyle={{ color: '#93c5fd' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorBalance)"
                    name="Balance Restante"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Payments List */}
        <div className="bg-slate-900 rounded-2xl shadow-lg shadow-black/20 border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-slate-200 font-semibold">
              Historial de Pagos
            </h3>
            <span className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              {currentDebtPayments.length} transacciones
            </span>
          </div>
          
          {currentDebtPayments.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p>Aún no has registrado ningún pago para esta deuda.</p>
              <p className="text-sm mt-1">¡Añade el primero usando el botón +!</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {currentDebtPayments.slice().reverse().map((payment) => (
                <div
                  key={payment.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-800 transition-colors group"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-200">
                      {formatCurrency(payment.amount)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDate(payment.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {payment.note && (
                      <span className="text-sm text-slate-400 hidden sm:block italic bg-slate-800 px-2 py-1 rounded border border-slate-700/50">
                        {payment.note}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeletePayment(payment.id)}
                      className="text-slate-600 hover:text-red-500 transition-colors p-2"
                      title="Eliminar pago"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Floating Action Button (Add Payment) */}
      <div className="fixed bottom-6 right-6">
        <button
          onClick={() => setShowAddPaymentModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white rounded-full p-4 shadow-lg shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center border border-blue-400/20"
        >
          <PlusIcon className="w-6 h-6" />
        </button>
      </div>

      {/* Add Payment Modal */}
      {showAddPaymentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-sm animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Nuevo Abono</h3>
                <button
                  onClick={() => setShowAddPaymentModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddPayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Monto (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={newPaymentAmount}
                    onChange={(e) => setNewPaymentAmount(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 outline-none text-lg font-semibold"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={newPaymentDate}
                    onChange={(e) => setNewPaymentDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Nota (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newPaymentNote}
                    onChange={(e) => setNewPaymentNote(e.target.value)}
                    placeholder="Ej. Transferencia banco"
                    className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg mt-2 transition-colors border border-blue-500/50 shadow-lg shadow-blue-900/50"
                >
                  Registrar Pago
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Total Amount Modal */}
      {showEditTotalModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-sm animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Editar Monto Inicial</h3>
                <button
                  onClick={() => setShowEditTotalModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleSaveTotal} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Nuevo Monto Total (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editingTotalAmount}
                    onChange={(e) => setEditingTotalAmount(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 outline-none text-lg font-semibold"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500">
                    Nota: Cambiar este monto recalculará el progreso y la deuda restante, pero no afectará los pagos ya registrados.
                </p>
                <div className="flex gap-3 mt-4">
                    <button
                        type="button"
                        onClick={() => setShowEditTotalModal(false)}
                        className="flex-1 px-4 py-3 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-900/50 transition-colors border border-blue-500/50"
                    >
                        Guardar
                    </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Ticket Template for Capture */}
      <div className="absolute top-0 left-[-9999px]">
        <div 
          ref={ticketRef} 
          className="w-[375px] bg-slate-50 text-slate-800 p-8 border border-slate-200 shadow-xl"
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {/* Header with Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="bg-slate-900 text-white p-3 rounded-full mb-3">
               <WalletIcon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black tracking-widest text-slate-900 uppercase">DebtTracker</h2>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Reporte de Estado</p>
          </div>
          
          {/* Info Block */}
          <div className="bg-white p-4 rounded-lg border border-slate-200 mb-6 text-sm shadow-sm">
             <div className="flex justify-between py-1 border-b border-slate-100">
               <span className="text-slate-500 font-bold text-xs">FECHA</span>
               <span className="font-semibold">{formatDate(ticketDate.toISOString())}</span>
             </div>
             <div className="flex justify-between py-1 border-b border-slate-100">
               <span className="text-slate-500 font-bold text-xs">HORA</span>
               <span className="font-semibold uppercase">{formatTime(ticketDate)}</span>
             </div>
             <div className="flex justify-between py-1 pt-2">
               <span className="text-slate-500 font-bold text-xs">ACREEDOR</span>
               <span className="font-bold text-slate-900">{selectedDebt!.creditorName}</span>
             </div>
          </div>

          <div className="text-center text-xs font-bold text-slate-400 mb-2 tracking-wider">RESUMEN FINANCIERO</div>

          {/* Numbers Block */}
           <div className="bg-white p-4 rounded-lg border border-slate-200 mb-6 shadow-sm">
             <div className="flex justify-between py-1">
              <span className="text-slate-600 text-sm">Total Deuda</span>
              <span className="font-mono font-bold">{formatCurrency(selectedDebt!.totalAmount)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-600 text-sm">Abonado</span>
              <span className="font-mono font-bold text-emerald-600">- {formatCurrency(totalPaid)}</span>
            </div>
            <div className="my-2 border-t-2 border-dashed border-slate-200"></div>
            <div className="flex justify-between items-end">
              <span className="text-slate-900 font-black text-lg">RESTANTE</span>
              <span className="font-mono font-black text-xl text-slate-900">{formatCurrency(remainingDebt)}</span>
            </div>
          </div>

          <div className="text-center text-xs font-bold text-slate-400 mb-2 tracking-wider">ÚLTIMOS MOVIMIENTOS</div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-slate-200 mb-8 overflow-hidden shadow-sm">
            <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-500 border-b border-slate-200">
                    <tr>
                        <th className="text-left p-3 font-semibold">Fecha</th>
                        <th className="text-right p-3 font-semibold">Monto</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {currentDebtPayments.length > 0 ? (
                        [...currentDebtPayments].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(p => (
                            <tr key={p.id}>
                                <td className="p-3">
                                    <div className="font-medium text-slate-700">{formatDate(p.date)}</div>
                                    {p.note && <div className="text-slate-400 text-[10px] italic truncate max-w-[140px]">{p.note}</div>}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-slate-700">
                                    {formatCurrency(p.amount)}
                                </td>
                            </tr>
                        ))
                    ) : (
                         <tr><td colSpan={2} className="p-4 text-center text-slate-400 italic">Sin movimientos</td></tr>
                    )}
                </tbody>
            </table>
             {currentDebtPayments.length > 5 && (
                <div className="bg-slate-50 p-2 text-center text-[10px] text-slate-500 border-t border-slate-200">
                    ... y {currentDebtPayments.length - 5} más ...
                </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="text-center space-y-2 opacity-60">
             <div className="flex justify-center mb-2">
                <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" style={{background: 'repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 10px, #f1f5f9 10px, #f1f5f9 20px)'}}></div>
             </div>
             <p className="text-[10px] font-medium uppercase tracking-widest">Desarrollado por Williams Cuamo</p>
             <p className="text-[9px]">DebtTracker App © {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}