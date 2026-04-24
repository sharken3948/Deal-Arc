import { initiateDeveloperControlledWalletsClient, generateEntitySecretCiphertext } from '@circle-fin/developer-controlled-wallets';

const entitySecret = '8db017bf1d11988703015cd4712c1fdace8565a43c83f98b86eeff3d0562fe45';
const apiKey = 'TEST_API_KEY:726981a54f8a113ad417fe6a367f9fe1:3d8da411ca244f33d205accceb281f9b';

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const { publicKey } = (await client.getPublicKey()).data;
const ciphertext = await generateEntitySecretCiphertext(entitySecret, publicKey);
console.log('Ciphertext:', ciphertext);