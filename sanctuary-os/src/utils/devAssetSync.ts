export type DevCoreAssetSyncKind =
  | 'core_lexicon'
  | 'core_themes'
  | 'default_schema'
  | 'spoke_schema_snapshot';

export async function postDevCoreAssetSync(params: {
  kind: DevCoreAssetSyncKind;
  id?: string;
  content: any;
}): Promise<boolean> {
  if (!import.meta.env.DEV || typeof fetch === 'undefined') {
    return false;
  }
  try {
    const res = await fetch('/__sync-core-assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sanctuary-dev-token':
          typeof __SANCTUARY_DEV_TOKEN__ !== 'undefined' ? __SANCTUARY_DEV_TOKEN__ : '',
      },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    return false;
  }
}

