# STREETBORN

Mahalle topçusunun profesyonelliğe yükselişini anlatan mobil futbol kariyer oyunu (iOS ve Android).

Mimari kararlar: [Teknik Mimari (MVP)](https://claude.ai/artifact/3TPHWXRnoauCcceCWUGoYa)

## Yapı

| Klasör | İçerik |
| --- | --- |
| `apps/mobile` | Expo (React Native) uygulaması |
| `packages/engine` | Deterministik maç motoru. Saf TypeScript, aynı seed ve girdiyle her cihazda ve sunucuda aynı sonucu verir |
| `packages/economy` | Ödül formülleri, maç doğrulama kuralları, enerji, varsayılan ekonomi ayarları |
| `supabase/migrations` | Veritabanı şeması, coin defteri (`ledger`), `grant_currency()` ve maç fonksiyonları |
| `supabase/functions` | Edge Functions: `match-start`, `match-finish` |
| `supabase/tests` | Şemayı boş bir Postgres'e kurup defter ve RLS kurallarını deneyen duman testi |

Temel kural: **istemci bakiyeyi asla değiştirmez.** Coin, elmas, XP ve enerji yalnızca sunucuda, `grant_currency()` üzerinden ve deftere yazılarak değişir.

## Telefonda denemek

1. Node 22 kur, sonra kök klasörde `npm install` çalıştır.
2. Telefonuna **Expo Go** uygulamasını indir.
3. `npm start` çalıştır ve terminalde çıkan QR kodunu Expo Go ile okut.

Şu anki ekran yalnızca iskelet: maç motorunun telefonda çalıştığını gösteren basit bir şut denemesi. Ödeme, reklam ve Firebase eklendiğinde Expo Go yerine EAS'ta derlenen development build kullanılacak.

## Komutlar

```bash
npm run typecheck   # tüm paketlerde TypeScript kontrolü
npm test            # motor ve ekonomi testleri (Vitest)
supabase/tests/run.sh   # şema duman testi (PGHOST/PGUSER ile bir Postgres gerekir)
```
