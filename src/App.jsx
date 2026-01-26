import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckSquare, Save, Loader2, DollarSign, Calculator, TrendingDown, LogIn, LogOut, User, Clock, Mail, Lock } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURAÇÃO DO FIREBASE (MANTIDA) ---
const firebaseConfig = {
  apiKey: "AIzaSyBS4HSc6Oen9kitBpczNYhPlTdXDwFFyw4",
  authDomain: "controleponto-384ec.firebaseapp.com",
  projectId: "controleponto-384ec",
  storageBucket: "controleponto-384ec.firebasestorage.app",
  messagingSenderId: "1040081706116",
  appId: "1:1040081706116:web:758f4459779ea597d836d1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "meu-ponto-oficial";

// --- Constantes de Cálculo ---
const BASE_DAILY_VALUE_NORMAL = 78.00; 
const HOURLY_RATE = 8.10; 
const NIGHT_SHIFT_ADDITIONAL = 0.20; 
const DISCOUNT_RATE = 0.11; 

// Duração das Extras (em horas decimais)
const WEEKDAY_EXTRA_DURATION = 2.67; // Aprox 2h 40min (02:20 até 05:00)
const WEEKEND_DURATION = 7.5; // 8h totais - 30min jantar

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workData, setWorkData] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados do Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // 1. Monitorar Autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Login com Email/Senha
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Erro login:", error);
      setAuthError('Email ou senha incorretos.');
    }
  };

  // Cadastro com Email/Senha
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Erro cadastro:", error);
      if (error.code === 'auth/email-already-in-use') {
        setAuthError('Este email já está cadastrado.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setAuthError('Erro ao criar conta.');
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setWorkData({}); 
  };

  // 2. Carregar dados
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'timesheet', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setWorkData(docSnap.data());
      } else {
        setWorkData({});
      }
      setLoading(false);
    }, (error) => setLoading(false));
    return () => unsubscribe();
  }, [user]);

  // Função de Salvar
  const saveToFirestore = async (newData) => {
    if (!user) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'timesheet', 'main');
      await setDoc(docRef, newData, { merge: true });
    } catch (error) {
      console.error("Erro ao salvar:", error);
    } finally {
      setSaving(false);
    }
  };

  // --- LÓGICA FINANCEIRA ---
  const calculateDailyEarnings = (date, entry) => {
    if (!entry) return 0;
    const dayOfWeek = date.getDay();
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;
    const isWeekend = isSaturday || isSunday;
    let total = 0;

    if (entry.weekendWork && isWeekend) {
      const workedHours = 7.5; 
      const nightHours = 1.5;
      if (isSaturday) {
        const tier1 = 2 * HOURLY_RATE * 1.5;
        const tier2 = 2 * HOURLY_RATE * 1.6;
        const tier3 = 3.5 * HOURLY_RATE * 2.0;
        const nightAd = nightHours * HOURLY_RATE * 2.0 * NIGHT_SHIFT_ADDITIONAL;
        total += tier1 + tier2 + tier3 + nightAd;
      } else if (isSunday) {
        const baseVal = workedHours * HOURLY_RATE * 2.0;
        const nightAd = nightHours * HOURLY_RATE * 2.0 * NIGHT_SHIFT_ADDITIONAL;
        total += baseVal + nightAd;
      }
    }

    if (!isWeekend) {
      if (entry.worked) total += BASE_DAILY_VALUE_NORMAL;
      if (entry.overtime) {
        const extraHours = 2.666;
        const overtimeRate = 1.5;
        const extraVal = extraHours * HOURLY_RATE * overtimeRate;
        const nightVal = extraVal * NIGHT_SHIFT_ADDITIONAL; 
        total += (extraVal + nightVal);
      }
    }
    return total;
  };

  const calculateExtraValueOnly = (date, entry) => {
    if (!entry) return 0;
    const dayOfWeek = date.getDay();
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;
    const isWeekend = isSaturday || isSunday;
    let extraValCalc = 0;

    if (entry.weekendWork && isWeekend) {
        const workedHours = 7.5; 
        const nightHours = 1.5;
        if (isSaturday) {
          const tier1 = 2 * HOURLY_RATE * 1.5;
          const tier2 = 2 * HOURLY_RATE * 1.6;
          const tier3 = 3.5 * HOURLY_RATE * 2.0;
          const nightAd = nightHours * HOURLY_RATE * 2.0 * NIGHT_SHIFT_ADDITIONAL;
          extraValCalc += tier1 + tier2 + tier3 + nightAd;
        } else if (isSunday) {
          const baseVal = workedHours * HOURLY_RATE * 2.0;
          const nightAd = nightHours * HOURLY_RATE * 2.0 * NIGHT_SHIFT_ADDITIONAL;
          extraValCalc += baseVal + nightAd;
        }
    }

    if (!isWeekend && entry.overtime) {
        const extraHours = 2.666;
        const overtimeRate = 1.5;
        const val = extraHours * HOURLY_RATE * overtimeRate;
        const nightVal = val * NIGHT_SHIFT_ADDITIONAL; 
        extraValCalc += (val + nightVal);
    }
    return extraValCalc;
  };

  const calculateExtraHours = (date, entry) => {
    if (!entry) return 0;
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend && entry.weekendWork) return WEEKEND_DURATION;
    if (!isWeekend && entry.overtime) return WEEKDAY_EXTRA_DURATION;
    return 0;
  };

  // --- Auxiliares ---
  const getDaysInMonth = (year, month) => {
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const days = getDaysInMonth(currentYear, currentMonth);
  const formatDateKey = (date) => date.toISOString().split('T')[0];
  const getDayName = (date) => ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][date.getDay()];

  // --- Manipulação ---
  const toggleDay = (date, field) => {
    const key = formatDateKey(date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if ((field === 'overtime' || field === 'worked') && isWeekend) return; 

    setWorkData(prev => {
      const currentEntry = prev[key] || { worked: false, overtime: false, weekendWork: false, notes: '' };
      const newValue = !currentEntry[field];
      let updatedEntry = { ...currentEntry, [field]: newValue };

      if (field === 'overtime' && newValue === true) updatedEntry.worked = true;
      if (field === 'worked' && newValue === false) updatedEntry.overtime = false;

      const newState = { ...prev, [key]: updatedEntry };
      saveToFirestore(newState);
      return newState;
    });
  };

  const handleNoteChange = (date, text) => {
    const key = formatDateKey(date);
    setWorkData(prev => ({ ...prev, [key]: { ...(prev[key] || {}), notes: text } }));
  };
  
  const handleNoteBlur = (date, text) => {
     const key = formatDateKey(date);
     saveToFirestore({ ...workData, [key]: { ...(workData[key] || {}), notes: text } });
  };

  // --- Totais ---
  const stats = useMemo(() => {
    return days.reduce((acc, day) => {
      const key = formatDateKey(day);
      const data = workData[key];
      const earnings = calculateDailyEarnings(day, data);
      const extraHours = calculateExtraHours(day, data);
      const extraValueOnly = calculateExtraValueOnly(day, data);

      if (data?.worked) acc.workedDays++;
      if (data?.overtime) acc.overtimeDays++;
      if (data?.weekendWork) acc.weekendDays++;
      acc.totalEarnings += earnings;
      acc.totalExtraHours += extraHours;
      acc.totalExtraValue += extraValueOnly;
      
      return acc;
    }, { workedDays: 0, overtimeDays: 0, weekendDays: 0, totalEarnings: 0, totalExtraHours: 0, totalExtraValue: 0 });
  }, [workData, days]);

  const totalDiscount = stats.totalEarnings * DISCOUNT_RATE;
  const netEarnings = stats.totalEarnings - totalDiscount;

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
    setCurrentDate(new Date(newDate));
  };

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-slate-600" /></div>;
  }

  // --- TELA DE LOGIN ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans text-gray-800">
        <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md border border-gray-200">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-3 rounded-full">
              <Calculator className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2 text-slate-800">
            {isRegistering ? 'Criar Nova Conta' : 'Controle Financeiro'}
          </h2>
          <p className="text-center text-gray-500 mb-6 text-sm">
            {isRegistering ? 'Crie sua conta para salvar seus dados.' : 'Entre com seu e-mail e senha.'}
          </p>

          <form onSubmit={isRegistering ? handleRegister : handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                  placeholder="******"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {authError && <p className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{authError}</p>}

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition shadow-md">
              {isRegistering ? 'Cadastrar' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <button 
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
            >
              {isRegistering ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- TELA PRINCIPAL ---
  return (
    <div className="min-h-screen bg-gray-50 p-2 md:p-4 font-sans text-gray-800">
      <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
        
        {/* Header */}
        <div className="bg-slate-800 text-white p-6">
          <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="w-8 h-8 text-green-400" />
              Controle Financeiro
            </h1>
            
            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-600">
                <User className="w-4 h-4 text-green-400" />
                <span className="text-xs font-bold max-w-[120px] truncate">{user.email}</span>
                <button onClick={handleLogout} className="ml-2 hover:text-red-300 transition" title="Sair"><LogOut className="w-4 h-4"/></button>
              </div>

              <div className="flex items-center gap-2 bg-slate-700 rounded-lg p-1 shadow-inner">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-600 rounded-md"><ChevronLeft className="w-5 h-5" /></button>
                <span className="font-semibold w-24 md:w-32 text-center text-sm uppercase">{monthNames[currentMonth]}</span>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-600 rounded-md"><ChevronRight className="w-5 h-5" /></button>
              </div>
            </div>
          </div>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-slate-700/40 p-3 rounded-lg border border-slate-600/50 flex flex-col items-center justify-center">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Dias Normais</span>
              <span className="text-2xl font-bold text-white mt-1">{stats.workedDays}</span>
            </div>
            <div className="bg-slate-700/40 p-3 rounded-lg border border-slate-600/50 flex flex-col items-center justify-center">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Extras (Semana)</span>
              <span className="text-2xl font-bold text-yellow-400 mt-1">{stats.overtimeDays}</span>
            </div>
             <div className="bg-slate-700/40 p-3 rounded-lg border border-slate-600/50 flex flex-col items-center justify-center">
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Fim de Semana</span>
              <span className="text-2xl font-bold text-blue-300 mt-1">{stats.weekendDays}</span>
            </div>

            {/* CARD: TOTAL HORAS EXTRAS (ARREDONDADO) */}
            <div className="bg-indigo-900/60 p-3 rounded-lg border border-indigo-500/50 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute top-0 right-0 p-1 opacity-20"><Clock className="w-10 h-10 text-indigo-300"/></div>
               <span className="text-indigo-200 text-[10px] uppercase font-bold tracking-wider z-10">Total Horas Extras</span>
               <div className="flex flex-col items-center z-10 mt-1">
                 <span className="text-2xl font-bold text-white leading-none">
                   {stats.totalExtraHours.toFixed(1)}h
                 </span>
                 <span className="text-[10px] font-medium text-indigo-300/80 mb-1">
                   ~{Math.round(stats.totalExtraHours)}h
                 </span>
                 {/* VALOR DAS EXTRAS */}
                 <span className="text-xs font-semibold text-indigo-100 bg-indigo-800/40 px-2 py-0.5 rounded shadow-sm border border-indigo-700/50">
                   + R$ {stats.totalExtraValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </span>
               </div>
            </div>
            
            {/* CARD: FINANCEIRO */}
            <div className="bg-gradient-to-br from-green-900 to-green-800 p-3 rounded-lg border border-green-600 shadow-lg transform scale-105 flex flex-col justify-center relative overflow-hidden">
               <div className="absolute top-0 right-0 p-1 opacity-10"><DollarSign className="w-16 h-16 text-white"/></div>
               <div className="flex justify-between w-full items-end z-10 mb-1">
                  <span className="text-green-200/70 text-[10px] uppercase font-bold tracking-wider">Bruto</span>
                  <span className="text-xs font-semibold text-green-100">R$ {stats.totalEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
               </div>
               <div className="flex justify-between w-full items-end z-10 mb-2 border-b border-green-700/50 pb-1">
                  <div className="flex items-center gap-1 text-red-300"><TrendingDown className="w-3 h-3" /><span className="text-[10px] font-bold">Desc.</span></div>
                  <span className="text-xs font-semibold text-red-300">- R$ {totalDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
               </div>
               <div className="flex flex-col w-full z-10 mt-1">
                  <span className="text-green-100 text-[9px] uppercase font-bold tracking-wider opacity-80">Líquido</span>
                  <span className="text-xl font-bold text-white leading-none">R$ {netEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
               </div>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-200">
                <th className="p-3 w-12 text-center">Dia</th>
                <th className="p-3 w-20">Semana</th>
                <th className="p-3 text-center w-16">Normal</th>
                <th className="p-3 text-center w-16">Até 05h</th>
                <th className="p-3 text-center w-20">Fim de Semana</th>
                <th className="p-3 w-20 text-right bg-indigo-50/50 text-indigo-800">Qtd. Extra</th>
                <th className="p-3 w-24 text-right">Valor Dia</th>
                <th className="p-3">Obs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {days.map((date) => {
                const key = formatDateKey(date);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isSunday = dayOfWeek === 0;
                
                const entry = workData[key] || { worked: false, overtime: false, weekendWork: false, notes: '' };
                const dayValue = calculateDailyEarnings(date, entry);
                const extraHours = calculateExtraHours(date, entry);

                return (
                  <tr key={key} className={`hover:bg-blue-50 transition-colors ${isWeekend ? 'bg-orange-50/40' : 'bg-white'} ${isSunday ? 'border-b-4 border-gray-100' : ''}`}>
                    <td className="p-3 text-center font-bold text-slate-700">{date.getDate()}</td>
                    <td className={`p-3 font-medium ${isWeekend ? 'text-orange-700' : 'text-slate-600'}`}>{getDayName(date)}</td>
                    <td className="p-3 text-center">{isWeekend ? (<div className="w-5 h-5 mx-auto rounded bg-gray-200 border border-gray-300 flex items-center justify-center opacity-50 cursor-not-allowed"><span className="block w-3 h-[1px] bg-gray-400 rotate-45"></span></div>) : (<input type="checkbox" checked={entry.worked} onChange={() => toggleDay(date, 'worked')} className="w-5 h-5 rounded border-gray-300 text-blue-600 cursor-pointer" />)}</td>
                    <td className="p-3 text-center">{isWeekend ? (<div className="w-5 h-5 mx-auto rounded bg-gray-200 border border-gray-300 flex items-center justify-center opacity-50 cursor-not-allowed"><span className="block w-3 h-[1px] bg-gray-400 rotate-45"></span></div>) : (<input type="checkbox" checked={entry.overtime} onChange={() => toggleDay(date, 'overtime')} className="w-5 h-5 rounded border-gray-300 text-yellow-500 cursor-pointer" />)}</td>
                    <td className="p-3 text-center">{isWeekend ? (<input type="checkbox" checked={entry.weekendWork} onChange={() => toggleDay(date, 'weekendWork')} className="w-5 h-5 rounded border-orange-300 text-orange-600 cursor-pointer" />) : (<span className="text-gray-300">-</span>)}</td>
                    
                    <td className="p-3 text-right font-mono font-bold text-indigo-700 bg-indigo-50/30">
                        {extraHours > 0 ? (
                            <span>+{extraHours.toFixed(1)}h</span>
                        ) : (
                            <span className="text-gray-300">-</span>
                        )}
                    </td>

                    <td className="p-3 text-right font-mono font-semibold text-slate-700">{dayValue > 0 ? (<span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">R$ {dayValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>) : (<span className="text-gray-300">-</span>)}</td>
                    <td className="p-3"><input type="text" value={entry.notes} onChange={(e) => handleNoteChange(date, e.target.value)} onBlur={(e) => handleNoteBlur(date, e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-300 focus:bg-white outline-none text-xs text-gray-500 py-1" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-[10px] text-gray-400"><span>Controle Completo.</span><span>ID: {user?.uid?.slice(0, 6)}</span></div>
      </div>
    </div>
  );
}