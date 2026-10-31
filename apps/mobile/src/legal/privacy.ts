import type { Lang } from '../i18n/index.ts';

// The privacy policy shown at /gizlilik (in the app and at the public web URL the store
// listings link to). Keep it true to what the code collects: when ads (AdMob), purchases
// (RevenueCat) or analytics are added, this text changes in the same pull request.

/** Where players write about their data. */
export const PRIVACY_CONTACT: string | null = 'support@streetborn.app';

export type Policy = { updated: string; intro: string; sections: { title: string; body: string[] }[] };

export const PRIVACY: Record<Lang, Policy> = {
  tr: {
    updated: 'Son güncelleme: 31 Ekim 2026',
    intro: 'StreetBorn bir mobil futbol kariyer oyunu. Bu metin, oyunu oynarken hangi verilerin tutulduğunu, ne için kullanıldığını ve nasıl silebileceğini anlatır.',
    sections: [
      {
        title: 'Topladığımız veriler',
        body: [
          'Hesap: oyuna ilk girişte sana rastgele bir oyuncu kimliği verilir. Hesabını bağlarsan e-posta adresin ya da Apple veya Google hesap kimliğin de kaydedilir.',
          'Oyun verisi: takma adın, karakterinin görünümü, seviyen, yeteneklerin, maçların ve sonuçları, coin ve elmas hareketlerin, kupaların, kulüp sözleşmen, mahalle üyeliğin ve verdiğin tezahüratlar.',
          'Güvenlik: yaptığın ve hakkında yapılan şikayetler, engellediğin oyuncular ve hile kontrolü için tutulan maç kayıtları. Sunucu, giriş ve güvenlik için IP adresini ve tarayıcı ya da cihaz bilgisini teknik kayıtlarda kısa süre tutabilir.',
          'Cihazında kalanlar: oturumun ve ses tercihlerin yalnızca cihazında saklanır.',
          'Konum, rehber, fotoğraf, kamera, mikrofon ya da reklam kimliği toplamıyoruz.',
        ],
      },
      {
        title: 'Ne için kullanıyoruz',
        body: [
          'Oyunu çalıştırmak, ilerlemeni kaydetmek, mahalle ve lig özelliklerini sunmak, hileyi ve kötüye kullanımı önlemek için. Verilerini satmıyoruz ve reklam için kimseyle paylaşmıyoruz.',
        ],
      },
      {
        title: 'Diğer oyuncular ne görür',
        body: [
          'Takma adın, seviyen, karakterin, mahalle maç puanların ve haftalık derbi skorun mahallendeki oyunculara görünür. E-posta adresini kimse görmez.',
        ],
      },
      {
        title: 'Verilerin nerede',
        body: [
          'Oyun sunucusu ve veritabanı Supabase altyapısında çalışır. Web sürümü Cloudflare üzerinden sunulur. Bu hizmetler verileri yalnızca oyunu çalıştırmak için işler.',
          'Elmas paketlerini telefonda App Store veya Google Play üzerinden satın alırsın. Satın almanı doğrulamak için RevenueCat, oyuncu kimliğini ve mağazanın satın alma kaydını (ürün, işlem numarası, fiyat, ülke) işler. Kart bilgilerin mağazada kalır; ne biz ne de RevenueCat onları görür.',
          'Uygulamaya reklam eklendiğinde bu metin, kullanılan hizmetlerle birlikte güncellenecek.',
        ],
      },
      {
        title: 'Ne kadar saklıyoruz',
        body: [
          'Hesabın durduğu sürece. Hesabını sildiğinde oyuncun ve tüm oyun verilerin hemen silinir. Mağaza iadeleri ve hile kontrolü için tutulan reklam ve satın alma kayıtları senin adın olmadan kalır.',
        ],
      },
      {
        title: 'Hakların ve hesap silme',
        body: [
          'KVKK ve GDPR kapsamında verilerine erişme, düzeltilmesini ve silinmesini isteme hakkın var. Hesabını istediğin an oyunda Profil > Hesabı sil adımından kendin silebilirsin.',
        ],
      },
    ],
  },
  en: {
    updated: 'Last updated: 31 October 2026',
    intro: 'StreetBorn is a mobile football career game. This page explains what data the game keeps while you play, what it is for, and how to delete it.',
    sections: [
      {
        title: 'What we collect',
        body: [
          'Account: the first time you play you get a random player ID. If you link your account, your email address or your Apple or Google account ID is stored too.',
          'Game data: your nickname, how your character looks, your level, skills, matches and results, coin and gem history, trophies, club contract, mahalle membership and the cheers you give.',
          'Safety: reports you make and reports about you, players you block, and match records kept to check for cheating. For sign-in and security, the server may briefly keep your IP address and browser or device details in its technical logs.',
          'On your device only: your session and sound settings.',
          'We do not collect your location, contacts, photos, camera, microphone or advertising ID.',
        ],
      },
      {
        title: 'What we use it for',
        body: [
          'To run the game, save your progress, provide the mahalle and league features, and stop cheating and abuse. We do not sell your data or share it with anyone for advertising.',
        ],
      },
      {
        title: 'What other players see',
        body: [
          'Your nickname, level, character, mahalle match points and weekly derby score are visible to the players in your mahalle. Nobody sees your email address.',
        ],
      },
      {
        title: 'Where your data is',
        body: [
          'The game server and database run on Supabase. The web version is served by Cloudflare. These services process data only to run the game.',
          'You buy gem packs on your phone through the App Store or Google Play. To verify a purchase, RevenueCat processes your player ID and the store\'s purchase record (product, transaction ID, price, country). Your card details stay with the store; neither we nor RevenueCat see them.',
          'When ads are added to the app, this page will be updated with the services they use.',
        ],
      },
      {
        title: 'How long we keep it',
        body: [
          'For as long as your account exists. When you delete your account, your player and all game data are deleted at once. Ad and purchase records kept for store refunds and fraud checks remain without your name.',
        ],
      },
      {
        title: 'Your rights and deleting your account',
        body: [
          'Under KVKK and the GDPR you can ask to see, correct or delete your data. You can delete your account yourself at any time in the game under Profile > Delete account.',
        ],
      },
    ],
  },
};
