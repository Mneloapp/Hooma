export const INSTAGRAM_NINE_DAY_CAMPAIGN_ID =
  "instagram-nine-day-2026-08-22" as const;

export type InstagramNineDayCampaignItem = {
  sequence: number;
  slug: string;
  postId: string;
  productCode: string;
  productName: string;
  productSlug: string;
  productUrl: string;
  scheduledAt: string;
  publishNotAfter: string;
  caption: string;
  captionSha256: string;
  videoSha256: string;
  coverSha256: string;
  audioPcmSha256: string;
  sourceReceiptSha256: string;
  provenanceSha256: string;
  sourceVoiceSha256: string;
  integratedLufs: number;
  truePeakDbtp: number;
  videoObjectPath: string;
  coverObjectPath: string;
};

const TRACK = {
  id: "hooma-original-playful-discovery-v1",
  sha256: "6f3490de73ceb508ebb5a4f5a778933c18ae03e846472e1d362acf0d7336bf57",
  licenseReceiptSha256:
    "06f7dd4e89a75d101b5dc0af270f86580e5f9bba135d3a72213c29e6533ca5f5",
} as const;

const item = (input: Omit<InstagramNineDayCampaignItem, "videoObjectPath" | "coverObjectPath">) => ({
  ...input,
  videoObjectPath: `instagram/${INSTAGRAM_NINE_DAY_CAMPAIGN_ID}/${input.postId}/${input.videoSha256}.mp4`,
  coverObjectPath: `instagram/${INSTAGRAM_NINE_DAY_CAMPAIGN_ID}/${input.postId}/${input.coverSha256}.jpg`,
});

export const INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS = [
  item({
    sequence: 1,
    slug: "03-bracelet-stand",
    postId: "P-20260822-IG-1230-BRACELET-STAND",
    productCode: "3053616",
    productName: "სამაჯურების სადგამი",
    productSlug: "display-stand-holder-for-bracelets-3053616",
    productUrl: "https://www.hooma.ge/product/display-stand-holder-for-bracelets-3053616",
    scheduledAt: "2026-08-22T12:30:00+04:00",
    publishNotAfter: "2026-08-22T14:00:00+04:00",
    caption: "სამაჯურები ლამაზად და მოწესრიგებულად — ყოველდღიური არჩევანი უფრო მარტივია. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "635626a3821b2125b85c250ddb03e0fd9101ec27acbb838a66b34457b962dbed",
    videoSha256: "845e83642dadd8b9ccb5ae0541403adcd8cedec1f04fe24b49acfcccdde108e7",
    coverSha256: "dfcc3f8fe8a2492102cf3d56999b998031d0fe53902b85433178ff7cc6e75bc1",
    audioPcmSha256: "bbb0b2f45b44be36e70f3c5391b26f1c255be0e9edb67c5eedfd2ea51ccc99ba",
    sourceReceiptSha256: "28898247efef966b27c71e263fa36d829dfffc4bde716baf036b080d6f67dddc",
    provenanceSha256: "f81d7397e7418d82846433bd883c31bdce34ce447764aeb61bb88040a1b39244",
    sourceVoiceSha256: "80ce50c516ac5bedb9103f3ab192128447a5d4d8788a8d9aa7f411530bbde1dd",
    integratedLufs: -13.71,
    truePeakDbtp: -2.87,
  }),
  item({
    sequence: 2,
    slug: "08-christmas-tree-gift-box",
    postId: "P-20260823-IG-2030-CHRISTMAS-TREE-GIFT-BOX",
    productCode: "3090293",
    productName: "საშობაო ნაძვის ხის ფორმის კანფეტის დამჭერი",
    productSlug: "hooma-product-3090293",
    productUrl: "https://www.hooma.ge/product/hooma-product-3090293",
    scheduledAt: "2026-08-23T20:30:00+04:00",
    publishNotAfter: "2026-08-23T22:00:00+04:00",
    caption: "საჩუქრის შეფუთვა, რომელიც თავადაც დეკორია — სადღესასწაულო განწყობისთვის. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "1a13319676e5965efb7ea22c62071ab471ce71e3c654bd54dde3d862cce59007",
    videoSha256: "71bb1ac971c34e19a408a65d52b6ab1e23422c960afc8cd664ac9f1c8fb3ab6d",
    coverSha256: "6c416a4930b040075fde3e312f090759e7fbdcfcea2cafa815b41a4ab20695fe",
    audioPcmSha256: "3633f7ed99468de2fbebb327b14e66583ec2e475a86cd142baab9131d4f0a133",
    sourceReceiptSha256: "2d8f62397f5e33c16aa162fb654126aac80c251693e99796fb38b9ce2c06f413",
    provenanceSha256: "898f76d967c63867738ea254a9843b5e7be932cdd7501193dfc954bd09c03988",
    sourceVoiceSha256: "27b2effff7a3d910eff1cc95ac431f6a2263066a2d6d1466caebed35d29a9bb2",
    integratedLufs: -15.84,
    truePeakDbtp: -2.92,
  }),
  item({
    sequence: 3,
    slug: "07-headphone-stand",
    postId: "P-20260824-IG-1830-HEADPHONE-STAND",
    productCode: "3076078",
    productName: "მოდულური ყურსასმენის სადგამი",
    productSlug: "2-3076078",
    productUrl: "https://www.hooma.ge/product/2-3076078",
    scheduledAt: "2026-08-24T18:30:00+04:00",
    publishNotAfter: "2026-08-24T20:00:00+04:00",
    caption: "ყურსასმენები უსაფრთხოდ და ყოველთვის ხელმისაწვდომად. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "cb73707e466ee040daed6960da4611b00c24b152ec6c7752b070d14746bc5819",
    videoSha256: "4a0dd5c9dc19473422d7f97dd62866d28f249c3dfa53cb231562a6ed83ad68e7",
    coverSha256: "7718cc2ca8d58b2bf9bcc2e9e8a2fad331f290334285ada02655b2fa730bb609",
    audioPcmSha256: "dd4ca4dce0368196df5ae737fbc885595f928901fe2649665f4dd0114028ff87",
    sourceReceiptSha256: "b9711b48367c9f3cafcfa448186bccac9abddf42fd8098319300023f74324fbf",
    provenanceSha256: "c02bf5f281f925bb56e6785c9b2d1ad597c2c9ddc6429f0971b9c506790b75fb",
    sourceVoiceSha256: "27d6c1dc2de553f48b03e62a23164c030b3575bc3b661b3bb283dc23abf55af7",
    integratedLufs: -13.95,
    truePeakDbtp: -2.48,
  }),
  item({
    sequence: 4,
    slug: "06-crab-desk-figure",
    postId: "P-20260825-IG-2100-CRAB-DESK-FIGURE",
    productCode: "3088148",
    productName: "მოძრავი თვალებიანი კიბორჩხალა",
    productSlug: "goofy-crab-noams-3088148",
    productUrl: "https://www.hooma.ge/product/goofy-crab-noams-3088148",
    scheduledAt: "2026-08-25T21:00:00+04:00",
    publishNotAfter: "2026-08-25T22:30:00+04:00",
    caption: "მხიარული აქცენტი სამუშაო მაგიდისთვის — პატარა ნივთი, დიდი ხასიათით. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "d4459104b1e9dbb148472025d0336c0b11343bec7ceb80071a3f2d8fe64c4b20",
    videoSha256: "dc5db39cc6caf722ad5113672782cc6d83768741e26435953e691954a44ccbf8",
    coverSha256: "6eb877818d015601c70b3fa4b2a0d6f654c7622e61e1ee10651ce92a69b9ba66",
    audioPcmSha256: "4938f3386ad2ded9a22346dde4bef46e9b9345d169a48f1c40a625ab745f6611",
    sourceReceiptSha256: "f636a8e3f8a785a787790ffb1241e2a4e8b4037915b65c0555bfc8593c433b20",
    provenanceSha256: "380248d5573ed14af4a25342411f75d6c29150024703ef5f0e1d44d79972188c",
    sourceVoiceSha256: "70902a773e43838f07d2a7518bde191f77a18f684cc9ec0035c343b5ed01951c",
    integratedLufs: -14.28,
    truePeakDbtp: -3.09,
  }),
  item({
    sequence: 5,
    slug: "09-tic-tac-toe",
    postId: "P-20260826-IG-1300-TIC-TAC-TOE",
    productCode: "3102051",
    productName: "ტიკ-ტაკ-ტო",
    productSlug: "hooma-product-3102051",
    productUrl: "https://www.hooma.ge/product/hooma-product-3102051",
    scheduledAt: "2026-08-26T13:00:00+04:00",
    publishNotAfter: "2026-08-26T14:30:00+04:00",
    caption: "X თუ O — რომელს ირჩევ? ვის ეთამაშებოდი? 👀\n\n#Hooma #საქართველო #ტიკტაქტო #სამაგიდოთამაში\n",
    captionSha256: "fcfc2d4c12de430f70d6a7ba558d570391c3da188427bfad736ca8d66b127308",
    videoSha256: "4d61254c25a6ed84d405d5e85a29f00304cdbed49e434f215983ab73ea99ddfc",
    coverSha256: "570a9d1c878a8a5e2e5632863d30b4c9d4f9f49f39a9f6762c049a5602ca89ef",
    audioPcmSha256: "7b8ddd0b6c9c6c9c1409ee6d4f41756e7a33478cdd1e1f72e497bbc5895c9da3",
    sourceReceiptSha256: "c633e3c067914d0226353a29b1bb64bc18ff99b44c85baf6e8a8056048061a07",
    provenanceSha256: "a134484c5ff513fde3fad80d2681e549dec8b39894a1e22418ef2dd77ebe75d4",
    sourceVoiceSha256: "5c741aa8ddbb21021f93e93ed8339c066f9a6814d1d5fa919baaaca5334cc802",
    integratedLufs: -15.36,
    truePeakDbtp: -2.86,
  }),
  item({
    sequence: 6,
    slug: "04-sheep-desk-figure",
    postId: "P-20260827-IG-1930-SHEEP-DESK-FIGURE",
    productCode: "3084898",
    productName: "მოძრავთვალებიანი ცხვარი",
    productSlug: "goofy-noams-3084898",
    productUrl: "https://www.hooma.ge/product/goofy-noams-3084898",
    scheduledAt: "2026-08-27T19:30:00+04:00",
    publishNotAfter: "2026-08-27T21:00:00+04:00",
    caption: "პატარა დეტალი, რომელიც სამუშაო მაგიდას ხასიათს მატებს. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "eed14151a84b2b8ff64fbdf20cedf037f30924d624cb4dcb1a2785b0baa7cb22",
    videoSha256: "aa20b939fb58c943cb64a9ee67eac725645f2cc718a05b7114acea30aa6c6309",
    coverSha256: "7e87bd5fe006db6d504a49184b62de0aa94e8d3c8a98b1f413c953c1d3add46d",
    audioPcmSha256: "111b498a644ec5b2d5a6f8a212569c33b7fc9c0b0696a8261dc8fd082acb6bc1",
    sourceReceiptSha256: "e7608edb7b857501ac2f1cec98f44c3cd2bb6594f179b17ed1ceeb495f9d4016",
    provenanceSha256: "88699bc466e3440f6f1d6babe6c2545bffc0f017a2816b7ec9ba37589b717f99",
    sourceVoiceSha256: "5527235e5610c85ace85a15111aa39884c70a6af45973cee8ec6c23ee2114053",
    integratedLufs: -14.77,
    truePeakDbtp: -2.86,
  }),
  item({
    sequence: 7,
    slug: "05-gamepad-stand",
    postId: "P-20260828-IG-2130-GAMEPAD-STAND",
    productCode: "3035369",
    productName: "GTA VI კონტროლერის სადგამი",
    productSlug: "gta-vi-universal-ps5-xbox-controller-stand-3035369",
    productUrl: "https://www.hooma.ge/product/gta-vi-universal-ps5-xbox-controller-stand-3035369",
    scheduledAt: "2026-08-28T21:30:00+04:00",
    publishNotAfter: "2026-08-28T23:00:00+04:00",
    caption: "კონტროლერი თავის ადგილზე — ნაკლები ქაოსი და უფრო მოწესრიგებული სივრცე. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "60acb35b5c737804b6ec597a3d6fe98e18b46335fdee0dfc659446e8872b04af",
    videoSha256: "97ae41b5d3e33b937fa8f4a97740778d5ab9549868befcd063fe8b78529f9aae",
    coverSha256: "ca6055a76bc1dd7c704c4fdf56cacacba21b077dfb0fefd1e35c41c50c5313b3",
    audioPcmSha256: "b8af3294801a6eb6096e07aa3d7e139c64c53bd8e295e32e8f6c64aad5cd641c",
    sourceReceiptSha256: "e236e6c5fe797164dca0f6d34caddf29fa3241b07f168c4d14c92dc30be8c552",
    provenanceSha256: "858448586b24f90f115755e5e901fc2cd9dacc974de5ad1b83e43d2e42d0caec",
    sourceVoiceSha256: "043e3f6ff9180df94d67f70e17f41b75a2d2c06e756a82412a60961d59999ecc",
    integratedLufs: -15.22,
    truePeakDbtp: -3.16,
  }),
  item({
    sequence: 8,
    slug: "02-snack-tray",
    postId: "P-20260829-IG-1730-SNACK-TRAY",
    productCode: "3035575",
    productName: "გულის ფორმის სნექის უჯრა სოუსის თასით",
    productSlug: "hooma-product-3035575",
    productUrl: "https://www.hooma.ge/product/hooma-product-3035575",
    scheduledAt: "2026-08-29T17:30:00+04:00",
    publishNotAfter: "2026-08-29T19:00:00+04:00",
    caption: "საყვარელი სასუსნავები ერთ ადგილას — მარტივი, თვალსაჩინო და მოსახერხებელი. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "d6bd759e3a7fa1ee3c8f6781aa83d37499831624c713ad076e6748be998556f9",
    videoSha256: "4b2a46246ebd9e3008545a433373eb7ae3ec1a41df9a044d85210d89d56a24ef",
    coverSha256: "a4cb670f5cc6794c3ae0e4afa7a556cb2e4bd65fbe6f021e91bd029b8bf65bb7",
    audioPcmSha256: "e94eea19ba07d4373171ea035fbd39d974c5ba44874f07424d391f8a924ca55b",
    sourceReceiptSha256: "90d2d25082e8f52678e902327ec38dca0db4a1d08f9a6c92625738ec37232822",
    provenanceSha256: "d29296abadebfe580380e1468ee757b5e7e3889c587e9246fa840657fa455cd3",
    sourceVoiceSha256: "5f88dfecff4f6bb863b9db20468f90edca023fb0972126fa3c6eee20511366fa",
    integratedLufs: -14.15,
    truePeakDbtp: -3.08,
  }),
  item({
    sequence: 9,
    slug: "01-tissue-box",
    postId: "P-20260830-IG-2000-TISSUE-BOX",
    productCode: "3063592",
    productName: "Mario-ს თემატიკის ხელსახოცების ყუთი",
    productSlug: "mario-v2-3063592",
    productUrl: "https://www.hooma.ge/product/mario-v2-3063592",
    scheduledAt: "2026-08-30T20:00:00+04:00",
    publishNotAfter: "2026-08-30T21:30:00+04:00",
    caption: "ქაღალდის ხელსახოცები ყოველთვის ხელთ — მოწესრიგებული მაგიდისთვის. ნახე Hooma-ზე ✨\n\n#Hooma #საქართველო #სახლი #ორგანიზება\n",
    captionSha256: "9707832b8650d30a85b9b6f7ba63ce520a05e5e0f432f36d7f447df113aa7eb5",
    videoSha256: "da814e65a5c5c4753799d4b8af4bcbdf783e9da3ebc9c48263d5c28b3629e81d",
    coverSha256: "a7f39739e65f5e8dcba8314f6cd4457738b7cea9ad3cf6723b7a367b4e90c801",
    audioPcmSha256: "f2629291b18f32fa65509d86281537767ae244806e48e64b852ca1e8c929e4a7",
    sourceReceiptSha256: "85958d7cdf3d81e32a6fc0aa417864255a8752ceeb46f8f7fa64237fc89351da",
    provenanceSha256: "f691b8845280a2d0d151050ebaec4ecddeea8952bc4b0cfec43212b11179e770",
    sourceVoiceSha256: "cbb326e2576a8af475fb6aeddc1b5921779362b355482d4132adf821915331ab",
    integratedLufs: -15.47,
    truePeakDbtp: -2.9,
  }),
] as const satisfies readonly InstagramNineDayCampaignItem[];

export function instagramNineDayCampaignItem(postId: unknown) {
  return typeof postId === "string"
    ? INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.find((entry) => entry.postId === postId) ?? null
    : null;
}

export function instagramNineDayMusicReceipt(item: InstagramNineDayCampaignItem) {
  return {
    schemaVersion: 1,
    receiptType: "HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE",
    immutable: true,
    context: {
      platform: "instagram",
      account: "@hooma.ge",
      postId: item.postId,
      campaignId: INSTAGRAM_NINE_DAY_CAMPAIGN_ID,
    },
    track: {
      id: TRACK.id,
      commercialUseAllowed: true,
      trackSha256: TRACK.sha256,
      license: {
        status: "VERIFIED",
        commercialUseAllowed: true,
        platforms: ["instagram"],
        receiptSha256: TRACK.licenseReceiptSha256,
      },
    },
    output: {
      sha256: item.videoSha256,
      audioPcmSha256: item.audioPcmSha256,
    },
    sourceReceipt: {
      receiptType: "HOOMA_LICENSED_VOICE_MUSIC_MASTER_PROVENANCE",
      receiptSha256: item.sourceReceiptSha256,
      provenanceSha256: item.provenanceSha256,
      sourceVoiceSha256: item.sourceVoiceSha256,
    },
  } as const;
}

export function instagramNineDaySettings(item: InstagramNineDayCampaignItem) {
  return {
    schema: "hooma-instagram-nine-day-campaign-v1",
    campaignId: INSTAGRAM_NINE_DAY_CAMPAIGN_ID,
    shareToFeed: true,
    shareToFacebook: false,
    facebookEnabled: false,
    aiGeneratedVisualDisclosure: true,
    ownerRightsAttestation: {
      status: "CONFIRMED",
      owner: "Giorgi",
      confirmedOn: "2026-08-21",
      scope: "USE_AND_UPLOAD_ALL_NINE_EXACT_CAMPAIGN_MASTERS",
    },
    exactCreativeApproval: {
      status: "APPROVED_EXACT",
      owner: "Giorgi",
      confirmedOn: "2026-08-21",
    },
    technicalQa: {
      status: "PASS",
      durationSeconds: 11.7,
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      cfrFps: 30,
      pixelFormat: "yuv420p",
      integratedLufs: item.integratedLufs,
      truePeakDbtp: item.truePeakDbtp,
    },
    analytics: { snapshotsHours: [2, 24, 72], unavailableMetrics: "NULL" },
    approvedPublishWindow: {
      scheduledAt: item.scheduledAt,
      publishNotAfter: item.publishNotAfter,
      timezone: "Asia/Tbilisi",
    },
  } as const;
}
