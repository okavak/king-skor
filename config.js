// config.js — ortak grup sunucusunun adresi ve uygulamanın kendiliğinden davet ettiği grup.
// API_BASE boşken grup özellikleri gizlenir. INVITE doluyken gruba katılmamış telefonlara açılışta davet gösterilir.
export const API_BASE = 'https://king-skor.okavak.workers.dev';
export const INVITE = { code: '4524A5XR', name: 'Meşe Park King' };
// Şaka: Başbuğ'un oynadığı oyunlarda tablodan açılabilen avans. Açıkken Başbuğ dışındaki her oyuncuya bu kadar puan eklenir.
export const BASBUG = { name: 'Başbuğ', avans: 100, icon: './icons/basbug.webp' };
