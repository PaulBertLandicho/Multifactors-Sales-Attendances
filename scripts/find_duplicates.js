require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function toFloat32Array(desc) {
  if (!desc) return null;
  if (Array.isArray(desc)) return new Float32Array(desc);
  try {
    if (desc.buffer && typeof desc.length === 'number') return new Float32Array(Array.from(desc));
  } catch (e) {}
  if (typeof desc === 'string') {
    try { const parsed = JSON.parse(desc); if (Array.isArray(parsed)) return new Float32Array(parsed); } catch(e){}
  }
  return null;
}

function normalizeDescriptor(arr) {
  if (!arr) return null;
  const f32 = toFloat32Array(arr);
  if (!f32) return null;
  let sum = 0; for (let i=0;i<f32.length;i++) sum += f32[i]*f32[i];
  const norm = Math.sqrt(sum) || 1.0;
  const out = new Float32Array(f32.length);
  for (let i=0;i<f32.length;i++) out[i] = f32[i]/norm;
  return out;
}

function euclideanDistance(a,b){ if(!a||!b||a.length!==b.length) return Infinity; let s=0; for(let i=0;i<a.length;i++){ const d=a[i]-b[i]; s+=d*d;} return Math.sqrt(s); }

async function findDuplicates(){
  const { data, error } = await supabase.from('persons').select('id,name,descriptor');
  if (error) { console.error('Supabase error:', error); process.exit(1); }
  const persons = (data||[]).map(p=>({ id:p.id, name:p.name, desc: p.descriptor ? normalizeDescriptor(toFloat32Array(p.descriptor)) : null }));
  const threshold = parseFloat(process.env.DUPLICATE_THRESHOLD || '0.35');
  const duplicates = [];
  for (let i=0;i<persons.length;i++){
    for (let j=i+1;j<persons.length;j++){
      const a = persons[i], b = persons[j];
      if (!a.desc || !b.desc) continue;
      const d = euclideanDistance(a.desc,b.desc);
      if (d < threshold) duplicates.push({ a: {id:a.id,name:a.name}, b:{id:b.id,name:b.name}, dist: d });
    }
  }
  if (!duplicates.length) {
    console.log('No potential duplicates found (threshold=',threshold,')');
  } else {
    console.log('Potential duplicates:');
    duplicates.forEach(x=> console.log(`${x.a.name} (${x.a.id})  <->  ${x.b.name} (${x.b.id})  dist=${x.dist.toFixed(4)}`));
  }
}

findDuplicates().catch(err=>{ console.error(err); process.exit(1); });
