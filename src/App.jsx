import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckSquare, Save, Loader2, DollarSign, Calculator, TrendingDown } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURAÇÃO DO FIREBASE (SEUS DADOS) ---
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
const HOURLY_RATE = 7.65; 
const NIGHT_SHIFT_ADDITIONAL = 0.20; 
const DISCOUNT_RATE = 0.11; 

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workData, setWorkData] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 1. Autenticação Simplificada
  useEffect(() => {
    const initAuth = async () => {
      await signInAnonymously(auth);
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  //Carregar dados
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

  //Função de Salvar
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

  // --- LÓGICA DE CÁLCULO FINANCEIRO ---
  const calculateDailyEarnings = (date, entry) => {
    if (!entry) return 0;
    
    const dayOfWeek = date.getDay(); // 0 = Dom, 6 = Sáb
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;
    const isWeekend = isSaturday || isSunday;

    let total = 0;

    // 1. CÁLCULO DE FIM DE SEMANA
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

    // 2. CÁLCULO DE DIA DE SEMANA
    if (!isWeekend) {
      if (entry.worked) {
        total += BASE_DAILY_VALUE_NORMAL;
      }

      if (entry.overtime) {
        const extraHours = 2.666;
        const overtimeRate = 1.5; // 50%
        const extraVal = extraHours * HOURLY_RATE * overtimeRate;
        const nightVal = extraVal * NIGHT_SHIFT_ADDITIONAL; 
        total += (extraVal + nightVal);
      }
    }

    return total;
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

    // Regra: Bloquear 'Hora Extra' E 'Normal' em fins de semana
    if ((field === 'overtime' || field === 'worked') && isWeekend) return; 

    setWorkData(prev => {
      const currentEntry = prev[key] || { worked: false, overtime: false, weekendWork: false, notes: '' };
      
      const newValue = !currentEntry[field];
      let updatedEntry = { ...currentEntry, [field]: newValue };

      // Regra: Se marcar "Até 05h", marca automaticamente o "Normal"
      if (field === 'overtime' && newValue === true) {
        updatedEntry.worked = true;
      }

      // Regra de consistência: Se desmarcar "Normal", remove a "Até 05h"
      if (field === 'worked' && newValue === false) {
        updatedEntry.overtime = false;
      }

      const newState = {
        ...prev,
        [key]: updatedEntry
      };
      saveToFirestore(newState);
      return newState;
    });
  };

  const handleNoteChange = (date, text) => {
    const key = formatDateKey(date);
    setWorkData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), notes: text }
    }));
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

      if (data?.worked) acc.workedDays++;
      if (data?.overtime) acc.overtimeDays++;
      if (data?.weekendWork) acc.weekendDays++;
      acc.totalEarnings += earnings;
      
      return acc;
    }, { workedDays: 0, overtimeDays: 0, weekendDays: 0, totalEarnings: 0 });
  }, [workData, days]);

  const totalDiscount = stats.totalEarnings * DISCOUNT_RATE;
  const netEarnings = stats.totalEarnings - totalDiscount;

  const changeMonth = (offset) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
    setCurrentDate(new Date(newDate));
  };

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-slate-600">
        <Loader2 className="w-8 h-8 animate-spin mr-2" />
        <span>Carregando...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2 md:p-4 font-sans text-gray-800">
      <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
        
        {/* Header */}
        <div className="bg-slate-800 text-white p-6">
          <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="w-8 h-8 text-green-400" />
              Controle Financeiro
            </h1>
            <div className="flex items-center gap-2">
              {saving && <span className="text-xs text-slate-400 animate-pulse flex items-center"><Save className="w-3 h-3 mr-1"/> Salvando...</span>}
              <div className="flex items-center gap-4 bg-slate-700 rounded-lg p-1 shadow-inner">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-600 rounded-md transition">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-semibold w-32 md:w-40 text-center text-lg uppercase tracking-wide">
                  {monthNames[currentMonth]} <span className="text-slate-400 text-sm">{currentYear}</span>
                </span>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-600 rounded-md transition">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            
            {/* CARD: RESUMO FINANCEIRO COMPLETO */}
            <div className="bg-gradient-to-br from-green-900 to-green-800 p-3 rounded-lg border border-green-600 shadow-lg transform scale-105 flex flex-col justify-center relative overflow-hidden">
               <div className="absolute top-0 right-0 p-1 opacity-10"><DollarSign className="w-16 h-16 text-white"/></div>
               
               <div className="flex justify-between w-full items-end z-10 mb-1">
                  <span className="text-green-200/70 text-[10px] uppercase font-bold tracking-wider">Bruto</span>
                  <span className="text-xs font-semibold text-green-100">
                    R$ {stats.totalEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
               </div>

               <div className="flex justify-between w-full items-end z-10 mb-2 border-b border-green-700/50 pb-1">
                  <div className="flex items-center gap-1 text-red-300">
                    <TrendingDown className="w-3 h-3" />
                    <span className="text-[10px] uppercase font-bold tracking-wider">Desc. (11%)</span>
                  </div>
                  <span className="text-xs font-semibold text-red-300">
                    - R$ {totalDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
               </div>

               <div className="flex flex-col w-full z-10 mt-1">
                  <span className="text-green-100 text-[9px] uppercase font-bold tracking-wider opacity-80">Líquido a Receber</span>
                  <span className="text-2xl font-bold text-white leading-none">
                    R$ {netEarnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
               </div>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-200">
                <th className="p-3 w-16 text-center">Dia</th>
                <th className="p-3 w-28">Semana</th>
                <th className="p-3 text-center w-24">Normal</th>
                <th className="p-3 text-center w-24">Até 05h</th>
                <th className="p-3 text-center w-32">Fim de Semana</th>
                <th className="p-3 w-32 text-right">Valor do Dia</th>
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

                return (
                  <tr 
                    key={key} 
                    className={`
                      hover:bg-blue-50 transition-colors
                      ${isWeekend ? 'bg-orange-50/40' : 'bg-white'}
                      ${isSunday ? 'border-b-4 border-gray-100' : ''}
                    `}
                  >
                    <td className="p-3 text-center font-bold text-slate-700">{date.getDate()}</td>
                    <td className={`p-3 font-medium ${isWeekend ? 'text-orange-700' : 'text-slate-600'}`}>{getDayName(date)}</td>

                    {/* Checkbox: Normal (Bloqueado no FDS) */}
                    <td className="p-3 text-center">
                      {isWeekend ? (
                        <div className="w-5 h-5 mx-auto rounded bg-gray-200 border border-gray-300 flex items-center justify-center opacity-50 cursor-not-allowed">
                           <span className="block w-3 h-[1px] bg-gray-400 rotate-45"></span>
                        </div>
                      ) : (
                        <input type="checkbox" checked={entry.worked} onChange={() => toggleDay(date, 'worked')}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                      )}
                    </td>

                    {/* Checkbox: Hora Extra Semana (Bloqueado no FDS) */}
                    <td className="p-3 text-center">
                      {isWeekend ? (
                        <div className="w-5 h-5 mx-auto rounded bg-gray-200 border border-gray-300 flex items-center justify-center opacity-50 cursor-not-allowed">
                           <span className="block w-3 h-[1px] bg-gray-400 rotate-45"></span>
                        </div>
                      ) : (
                        <input type="checkbox" checked={entry.overtime} onChange={() => toggleDay(date, 'overtime')}
                          className="w-5 h-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500 cursor-pointer" />
                      )}
                    </td>

                    {/* Checkbox: Fim de Semana (Só aparece no FDS) */}
                    <td className="p-3 text-center">
                        {isWeekend ? (
                           <input type="checkbox" checked={entry.weekendWork} onChange={() => toggleDay(date, 'weekendWork')}
                              className="w-5 h-5 rounded border-orange-300 text-orange-600 focus:ring-orange-500 cursor-pointer" />
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                    </td>

                    <td className="p-3 text-right font-mono font-semibold text-slate-700">
                      {dayValue > 0 ? (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                          R$ {dayValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>

                    <td className="p-3">
                      <input type="text" value={entry.notes} onChange={(e) => handleNoteChange(date, e.target.value)} onBlur={(e) => handleNoteBlur(date, e.target.value)}
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-300 focus:bg-white outline-none text-xs text-gray-500 py-1" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-[10px] text-gray-400">
           <span>Valores aproximados baseados nas regras configuradas.</span>
           <span>ID: {user?.uid?.slice(0, 6)}</span>
        </div>
      </div>
    </div>
  );
}