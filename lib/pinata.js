export async function uploadToPinata(buffer, filename, mimeType) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key:        process.env.PINATA_API_KEY,
      pinata_secret_api_key: process.env.PINATA_SECRET,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${text}`);
  }

  const { IpfsHash } = await res.json();
  return `https://gateway.pinata.cloud/ipfs/${IpfsHash}`;
}
