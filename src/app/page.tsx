'use client';

import { useEffect, useRef, useState } from 'react';
import { concernKeys, defaultProfile, exampleAnalysis, labels, type Analysis, type Category, type Concern, type Profile, type Routine, type RoutineStep } from '@/lib/domain';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" /></>,
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
    drop: <path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z" />,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    sparkle: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.plus}</svg>;
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, cache: 'no-store' });
  const data = await r.json();
  if (!r.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.') as Error & { status: number }; error.status = r.status; throw error; }
  return data;
}

export default function Home() {
  const [stage, setStage] = useState<'intro' | 'profile' | 'photo' | 'processing' | 'results'>('intro');
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [live, setLive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<'am' | 'pm'>('am');
  const [map, setMap] = useState<Concern | null>(null);
  const [mapError, setMapError] = useState(false);
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [dialog, setDialog] = useState<'method' | 'privacy' | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const pollStart = useRef(0);
  const heading = useRef<HTMLElement>(null);
  const returnToResult = useRef(false);

  useEffect(() => { api('/api/session').then(d => { setLive(d.liveEnabled); setConnected(true); }).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') api('/api/session').then(d => { setLive(d.liveEnabled); setConnected(true); }).catch(() => {}); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }, [stage]);
  useEffect(() => { return () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }; }, [preview]);
  useEffect(() => { if (!dialog) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setDialog(null); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [dialog]);

  async function buildRoutine(a: Analysis, p = profile) {
    const data = await api('/api/routine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ example: a.source === 'example', profile: p }) });
    setAnalysis(a); setRoutine(data.routine); setMap(null); setStage('results');
  }
  async function example() {
    setBusy(true); setError('');
    try { const p = stage === 'intro' ? { ...defaultProfile, skinType: 'dry' as const, sensitivity: 'yes' as const } : profile; setProfile(p); await buildRoutine(exampleAnalysis, p); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function submitProfile() {
    setError(''); if (!profile.goals.length) { setError('Choose one or two goals to continue.'); return; }
    if (returnToResult.current && analysis) { setBusy(true); try { await buildRoutine(analysis); returnToResult.current = false; } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
    else setStage('photo');
  }
  function chooseFile(f?: File) {
    setError(''); if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setError('Choose a JPEG, PNG or WebP photo.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('Choose a photo smaller than 5 MB.'); return; }
    setPhoto(f); setPreview(URL.createObjectURL(f));
  }
  async function chooseDemoPhoto() {
    setError('');
    try {
      const response = await fetch('/demo-person-analysis.jpg');
      if (!response.ok) throw new Error('The demo photo could not be loaded.');
      chooseFile(new File([await response.blob()], 'fictional-demo-portrait.jpg', { type: 'image/jpeg' }));
      setConsent(false);
    } catch (e) { setError((e as Error).message); }
  }
  async function analyze() {
    if (uploadLock.current || !photo || !consent || !adult) return;
    uploadLock.current = true; setBusy(true); setError('');
    try {
      await api('/api/analysis', { method: 'POST', headers: { 'Content-Type': photo.type }, body: photo });
      pollStart.current = Date.now(); setPollStopped(false); setStage('processing');
    } catch (e) { setError((e as Error).message); }
    finally { uploadLock.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (stage !== 'processing' || pollStopped) return;
    let cancelled = false; let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      if (cancelled) return;
      try {
        const data = await api('/api/analysis/status');
        if (cancelled) return;
        if (data.status === 'success') { await buildRoutine(data.analysis); return; }
        if (Date.now() - pollStart.current > 5 * 60_000) { setError('This is taking longer than expected. Resume checking to retrieve the same task; it will not submit another analysis.'); setPollStopped(true); return; }
        timeout = setTimeout(poll, 10000);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          if ([422, 504].includes((e as Error & { status?: number }).status ?? 0)) { setStage('photo'); setConsent(false); }
          else setPollStopped(true);
        }
      }
    }
    timeout = setTimeout(poll, 1000); return () => { cancelled = true; clearTimeout(timeout); };
    // The profile is fixed during an analysis; changed answers are applied after completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pollStopped]);

  async function reset() {
    setError(''); setBusy(true);
    try { try { await api('/api/session', { method: 'DELETE' }); } catch(e) { if((e as Error & {status?:number}).status!==401)throw e; } setProfile(defaultProfile); setAnalysis(null); setRoutine(null); setPhoto(null); setPreview(''); setConsent(false); setAdult(false); returnToResult.current = false; setStage('intro'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copyRoutine() {
    if (!routine || !analysis) return;
    const text = [`SKIN AI — ${analysis.source === 'example' ? 'ILLUSTRATIVE EXAMPLE' : 'Personal routine'}`, routine.title, '', 'MORNING', ...routine.steps.map(s => `${s.title}: ${s.product ? `${s.product.brand} ${s.product.name}` : 'Choose by category'}\n${s.reason}\n${s.instruction}`), '', 'EVENING', ...routine.steps.filter(s => s.category !== 'sunscreen').map(s => `${s.title}: ${s.product ? `${s.product.brand} ${s.product.name}` : 'Choose by category'}`), '', ...routine.notes].join('\n\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError('Clipboard is unavailable in this browser. Select the routine text to copy it.'); }
  }
  const isExample = analysis?.source === 'example';
  const mask = analysis?.findings.find(f => f.key === map)?.maskUrl;

  return <>
    <header className="site-header"><button className="wordmark" onClick={() => stage === 'processing' ? undefined : stage === 'intro' ? undefined : void reset()} aria-label="Skin AI home" disabled={busy || stage === 'processing'}>SKIN<span className="brand-slash">/</span><span className="brand-ai">AI</span><span className="brand-dot" /></button><span className="header-caption">A LITTLE CLARITY FOR YOUR SKIN.</span><button className="text-button header-method" onClick={() => setDialog('method')}>Our approach <Icon name="plus" size={15} /></button></header>
    {error && <div className="error-bar" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss message"><Icon name="close" size={16} /></button></div>}

    <main ref={heading} tabIndex={-1} className={`main stage-${stage}`}>
      {stage === 'intro' && <>
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span className="tiny-cross">✳</span> PERSONAL SKINCARE, CONSIDERED</div><h1>Less guesswork.<br /><em>More understanding.</em></h1><p className="hero-description">A clearer picture of your skin.<br />A simpler way to care for it.</p><p className="hero-sub">Turn the observations in your photo into a thoughtful daily routine, shaped around your skin and your answers.</p><div className="hero-actions"><button className="button primary" onClick={() => { returnToResult.current = false; setStage('profile'); }}>Find my routine <Icon name="arrow" /></button><button className="button subtle" onClick={example} disabled={busy}>{busy ? 'Opening…' : 'Explore an example'} <span>↗</span></button></div><div className="hero-small"><Icon name="shield" size={15} /> No account. No shopping links. Just a starting point.</div></div>
          <div className="portrait-wrap"><div className="portrait-frame"><img src="/demo-person.jpg" alt="AI-generated fictional adult used to demonstrate the interface" className="hero-portrait" /><div className="viewfinder corner-tl" /><div className="viewfinder corner-br" /><div className="portrait-top"><span className="small-dot" /> OBSERVE. UNDERSTAND. CARE.</div><div className="portrait-bottom"><span>YOUR SKIN HAS CONTEXT.</span><span>SO SHOULD YOUR ROUTINE.</span></div></div><div className="portrait-caption"><span>01 / A MORE CONSIDERED ROUTINE</span><span>AI-GENERATED DEMO PORTRAIT</span></div></div>
        </section>
        <section className="principles"><div className="principle"><span className="number">01</span><div><h3>Look a little closer.</h3><p>Six observations from a single photo, with YouCam Skin Analysis.</p></div></div><div className="principle"><span className="number">02</span><div><h3>Make it personal.</h3><p>Your goals, sensitivities and preferences are part of the picture.</p></div></div><div className="principle"><span className="number">03</span><div><h3>Keep what matters.</h3><p>A simple morning and evening edit. Every recommendation explained.</p></div></div></section>
        <div className="closing-line"><span>YOUR SKIN ISN’T A SCORE.</span><p>One photo is a starting point, not a diagnosis.</p><button className="text-button" onClick={() => setDialog('method')}>How we build your routine <Icon name="arrow" size={16} /></button></div>
      </>}

      {stage === 'profile' && <section className="flow-layout"><aside className="flow-aside"><StepProgress step={1} /><h1>A little<br /><em>about you.</em></h1><p>Your answers matter just as much as the photo. Start with what you know.</p><div className="aside-note"><Icon name="drop" size={28} /><p>No perfect skin types.<br />No perfect answers.</p></div></aside><form className="profile-form" onSubmit={e => { e.preventDefault(); void submitProfile(); }}>
        <fieldset><legend><span>01</span> How does your skin usually feel?</legend><div className="choice-grid">{(['unknown', 'dry', 'normal', 'combination', 'oily'] as const).map(t => <button key={t} type="button" aria-pressed={profile.skinType === t} className={`choice ${profile.skinType === t ? 'selected' : ''}`} onClick={() => setProfile({ ...profile, skinType: t })}>{({ unknown: 'Not sure yet', dry: 'Dry / tight', normal: 'Balanced', combination: 'Combination', oily: 'Oily / shiny' })[t]}{profile.skinType === t && <Icon name="check" size={16} />}</button>)}</div></fieldset>
        <fieldset><legend><span>02</span> What would you like to focus on?</legend><p className="field-help">Choose up to two. You don’t need to address everything.</p><div className="choice-grid goals">{concernKeys.map(key => <button key={key} type="button" className={`choice ${profile.goals.includes(key) ? 'selected' : ''}`} aria-pressed={profile.goals.includes(key)} onClick={() => setProfile({ ...profile, goals: profile.goals.includes(key) ? profile.goals.filter(k => k !== key) : profile.goals.length < 2 ? [...profile.goals, key] : [profile.goals[0], key] })}>{labels[key]}{profile.goals.includes(key) && <Icon name="check" size={16} />}</button>)}</div></fieldset>
        <div className="form-columns"><label className="field-label">Does your skin react easily?<select value={profile.sensitivity} onChange={e => setProfile({ ...profile, sensitivity: e.target.value as Profile['sensitivity'] })}><option value="unknown">I’m not sure</option><option value="yes">Yes, often sensitive</option><option value="no">No, usually comfortable</option></select></label><label className="field-label">Using a prescribed skin treatment?<select value={String(profile.treatment)} onChange={e => setProfile({ ...profile, treatment: e.target.value === 'true' })}><option value="false">No</option><option value="true">Yes</option></select></label></div>
        <label className="field-label">Any ingredients you need to avoid? <span className="optional">Optional</span><input value={profile.avoid} maxLength={200} onChange={e => setProfile({ ...profile, avoid: e.target.value })} placeholder="For example, a known ingredient allergy" /><span className="field-help">We screen recognized ingredients against captured US lists. Use semicolons between ingredients. Unknown terms withhold named options; always check your local package.</span></label>
        <div className="form-actions"><button type="button" className="text-button" onClick={() => setStage(analysis ? 'results' : 'intro')}><Icon name="back" size={17} /> Back</button><button className="button primary" disabled={busy || !profile.goals.length}>{busy ? 'Updating…' : returnToResult.current ? 'Update my routine' : 'Continue to photo'}<Icon name="arrow" /></button></div>
      </form></section>}

      {stage === 'photo' && <section className="flow-layout"><aside className="flow-aside"><StepProgress step={2} /><h1>A clearer<br /><em>picture.</em></h1><p>One front-facing photo, in even light. Your face should fill most of the frame.</p><ul className="photo-tips"><li><Icon name="check" size={16} /> Natural light, no beauty filters</li><li><Icon name="check" size={16} /> One face, forehead and chin visible</li><li><Icon name="check" size={16} /> No makeup or face coverings</li><li><Icon name="check" size={16} /> JPEG, PNG or WebP · Up to 5 MB</li></ul></aside><div className="photo-panel">
        <input className="sr-only" id="photo-input" ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button className={`upload-area ${preview ? 'has-photo' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseFile(e.dataTransfer.files[0]); }} aria-label={preview ? 'Change selected photo' : 'Choose a photo'}>{preview ? <><img src={preview} alt="Your selected photo, not yet submitted" /><span className="replace-photo">Change photo <Icon name="upload" size={16} /></span></> : <><span className="upload-circle"><Icon name="upload" size={30} /></span><h3>Your starting point.</h3><p>Choose a photo or drop one here.</p><span className="upload-label">UPLOAD A PHOTO <span>↗</span></span></>}</button>
        <button type="button" className="text-button" onClick={chooseDemoPhoto} disabled={busy}>Use the fictional demo photo <Icon name="sparkle" size={16} /></button>
        <label className="check-label"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} /><span>I’m 18 or older and have permission to use this photo.</span></label><label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>I agree to send this photo to Perfect Corp. for analysis. Its published file-retention policy states up to 30 days. <button type="button" className="inline-link" onClick={() => setDialog('privacy')}>Photo privacy</button></span></label>
        {!live && <div className="notice" role="status"><strong>Live photo analysis is switched off.</strong><br />That is why “Understand my skin” is disabled, even with a photo and consent. You can explore the example below; it does not analyze your uploaded photo.</div>}
        <div className="form-actions"><button className="text-button" onClick={() => setStage('profile')} disabled={busy}><Icon name="back" size={17} /> Back</button><button className="button primary" disabled={busy || !photo || !consent || !adult || !live} onClick={analyze}>{busy ? 'Sending your photo…' : 'Understand my skin'}<Icon name="arrow" /></button></div><button className="text-button example-instead" onClick={example} disabled={busy}>Prefer to explore the example?</button>
      </div></section>}

      {stage === 'processing' && <section className="processing"><div className="orbit"><Icon name="sparkle" size={42} /></div><span className="eyebrow">A MOMENT FOR YOUR SKIN</span><h1>Looking<br /><em>a little closer.</em></h1><p>Your photo is being analyzed by YouCam.<br />We’ll bring the observations and your answers together.</p><div className="processing-lines"><span>Photo received <Icon name="check" size={16} /></span><span>Waiting for skin observations <span className={pollStopped ? '' : 'pulse-dot'} /></span><span className="muted">Your routine comes next</span></div>{pollStopped && <button className="button primary" onClick={() => { setError(''); pollStart.current = Date.now(); setPollStopped(false); }}>Resume checking <Icon name="arrow" /></button>}<p className="micro">You can keep this page open. Processing times vary.</p></section>}

      {stage === 'results' && analysis && routine && <>
        {isExample && <div className="example-banner"><Icon name="sparkle" size={17} /><div><strong>Illustrative example</strong><span>Fictional portrait and authored scores, not live results. Editable example answers: {profile.skinType} skin; sensitivity {profile.sensitivity}.</span></div><button className="text-button" onClick={() => { returnToResult.current = false; setAnalysis(null); setStage('profile'); }}>Try your photo <Icon name="arrow" size={16} /></button></div>}
        <div className="result-heading"><div><div className="eyebrow">YOUR PERSONAL ROUTINE</div><h1>Your daily <em>edit.</em></h1></div><div className="result-actions"><button className="text-button" onClick={() => { returnToResult.current = true; setStage('profile'); }}>Edit answers <Icon name="plus" size={16} /></button><button className="icon-button" onClick={copyRoutine} aria-label="Copy morning and evening routine" title="Copy routine"><Icon name={copied ? 'check' : 'copy'} /></button></div></div>
        <section className="results-grid"><div className="analysis-column"><div className="result-photo"><img src={isExample ? '/demo-person.jpg' : preview || '/demo-person.jpg'} alt={isExample ? 'Fictional AI-generated example person' : 'Photo used for your analysis'} />{mask && !mapError && <img className="mask-image" src={mask} alt={`${labels[map!]} visualization from YouCam`} onError={() => setMapError(true)} />}<span className="photo-source">{isExample ? 'DEMONSTRATION PORTRAIT' : 'YOUR PHOTO · YOUCAM ANALYSIS'}</span></div>
          <div className="observation-header"><h3>The observations</h3><button className="text-button" onClick={() => setDialog('method')} aria-label="About the scores">ⓘ</button></div><p className="score-explanation">Raw scores · Higher means a more favorable observation in the provider’s scale. Not clinical severity.</p>
          <div className="observations">{analysis.findings.map(f => <button key={f.key} className={`observation ${map === f.key ? 'active' : ''}`} onClick={() => { setMap(map === f.key ? null : f.key); setMapError(false); }} disabled={!f.maskUrl}><span>{labels[f.key]}</span><div className="score-track"><span style={{ width: `${f.rawScore}%` }} /></div><strong>{Math.round(f.rawScore)}</strong>{f.maskUrl && <span className="map-hint">↗</span>}</button>)}</div>{mapError && <p className="micro">The visual map is unavailable. The scores remain available.</p>}<p className="micro">{isExample ? 'Sample numbers are for exploring the interface only.' : 'Lighting, pose and camera settings can affect the observations. Tap an available observation to view its map.'}</p>
        </div><div className="routine-column"><div className="routine-intro"><span className="small-label">THE APPROACH</span><h2>{routine.title}</h2><p>{routine.description}</p><div className="priority-tags">{routine.priorities.map(p => <span key={p.key} title={p.reason}>{labels[p.key]}</span>)}</div></div><div className="period-tabs" role="tablist" aria-label="Routine time of day"><button role="tab" id="tab-am" aria-controls="routine-panel" aria-selected={period === 'am'} onClick={() => setPeriod('am')}><Icon name="sun" size={18} /> Morning <span>03 STEPS</span></button><button role="tab" id="tab-pm" aria-controls="routine-panel" aria-selected={period === 'pm'} onClick={() => setPeriod('pm')}><Icon name="moon" size={18} /> Evening <span>02 STEPS</span></button></div><div id="routine-panel" role="tabpanel" aria-labelledby={`tab-${period}`}>{routine.steps.filter(s => period === 'am' || s.category !== 'sunscreen').map((s, i) => <ProductStep key={`${s.category}-${profile.skinType}-${profile.avoid}-${profile.sensitivity}`} step={s} number={i + 1} />)}</div><div className="routine-note"><Icon name="shield" size={20} /><div><strong>A starting point, not a prescription.</strong><p>Introduce changes gradually and check product labels. If a product irritates your skin, stop using it and seek advice.</p></div></div></div></section>
        <section className="context-notes"><span className="small-label">KEEP IN MIND · {routine.catalogue.productCount} LABEL-CHECKED RECORDS</span>{routine.notes.map((note, i) => <p key={i}>{note}</p>)}</section><div className="results-bottom"><button className="button primary" onClick={copyRoutine}>{copied ? 'Copied to clipboard' : 'Keep my routine'}<Icon name={copied ? 'check' : 'copy'} size={18} /></button><button className="text-button" disabled={busy} onClick={reset}>Clear session & start again <Icon name="back" size={16} /></button></div>
      </>}
    </main>

    <footer className="site-footer"><span>SKIN / AI <span className="footer-divider">—</span> LESS, BUT CONSIDERED.</span><div><button onClick={() => setDialog('privacy')}>Photo privacy</button><button onClick={() => setDialog('method')}>Our approach</button><span className="provider-credit">Analysis powered by YouCam</span></div></footer>
    {dialog && <div className="modal-backdrop" onClick={() => setDialog(null)}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" onClick={() => setDialog(null)} aria-label="Close dialog"><Icon name="close" /></button><span className="small-label">A LITTLE TRANSPARENCY</span><h2 id="dialog-title">{dialog === 'privacy' ? 'Your photo, in context.' : 'How the pieces connect.'}</h2>{dialog === 'privacy' ? <><p>Your photo is sent to Perfect Corp. only when you choose live analysis and consent. We do not keep a permanent photo library or use analytics trackers.</p><p>Analysis sessions are accessible for 30 minutes. The hosted app keeps task state and scores in encrypted private storage, without your photo or form answers. Expired records are removed during later requests or daily cleanup. Clearing a finished session removes its result from this app; it does not delete provider files.</p><p>Perfect Corp.’s general file policy states that uploaded and generated files are removed after 30 days. Its feature guide contains different result-access timing; we do not promise immediate provider deletion.</p><p>Use only photos you have permission to process. The example uses an AI-generated fictional adult and does not upload your photo.</p><a className="inline-link" href="https://docs.perfectcorp.com/develop/file_retention_period" target="_blank" rel="noreferrer">Read the provider’s file policy ↗</a></> : <><p>YouCam provides photo-based observations for hydration, oil balance, visible redness, texture, pores and blemishes. These are cosmetic observations, not medical findings.</p><p>We use raw scores to compare observations within the photo. YouCam’s separate UI scores are adjusted for presentation; neither is treated as a clinical measurement or disease threshold.</p><p>Your answers filter a limited US reference catalogue. Each released record has a captured ingredient list, explicit skin-type label, source date and review trail. These are technical label checks, not clinical validation or a full-market ranking. Basic routine guidance cites the American Academy of Dermatology; it does not endorse these brands.</p><p>Recognized ingredient restrictions are checked against the captured US formula; unresolved terms, unknown skin type or an unknown prescription mean no named matches. No photo score selects a treatment. Confirm your exact local package. The example’s scores are authored fixtures, not measurements of its portrait.</p><a className="inline-link" href="https://docs.perfectcorp.com/reference/ai_skin_analysis" target="_blank" rel="noreferrer">Read about YouCam Skin Analysis ↗</a></>}</section></div>}
  </>;
}

function StepProgress({ step }: { step: number }) { return <div className="step-progress" aria-label={`Step ${step} of 3`}>{['ABOUT YOU', 'YOUR PHOTO', 'YOUR ROUTINE'].map((s, i) => <span key={s} className={i + 1 <= step ? 'current' : ''}><b>0{i + 1}</b>{i + 1 === step && s}{i < 2 && <i />}</span>)}</div>; }
function ProductStep({ step, number }: { step: RoutineStep; number: number }) {
  const [alternative, setAlternative] = useState(false);
  const product = alternative ? step.alternative : step.product;
  const icon: Record<Category, string> = { cleanser: 'drop', moisturizer: 'sparkle', sunscreen: 'sun' };
  return <article className="product-step"><div className="step-top"><span className="step-number">0{number}</span><h3>{step.title}</h3><Icon name={icon[step.category]} size={20} /></div>{product ? <div className="product-card"><div className={`product-vessel vessel-${step.category}`} aria-hidden="true"><span className="vessel-cap" /><span className="vessel-body"><span>SKIN<br />ESSENTIAL</span><i /></span></div><div className="product-info"><span className="product-brand">{product.brand}</span><h4>{product.name}</h4><p>{product.highlights.join(' · ')}</p><span className="product-texture">{product.texture === 'rich' ? 'Richer texture' : product.texture === 'light' ? 'Lightweight texture' : 'Texture not specified'} · US reference</span></div></div> : <div className="category-fallback"><strong>Choose by category</strong><p>{step.fallback}</p></div>}<details className="why" open><summary>Why this step <span>+</span></summary><p>{step.reason}</p><p className="instruction">{step.instruction}</p></details><details className="why source-details"><summary>Sources & label checks <span>+</span></summary><p>{step.eligibleCount} options passed the filters. This is a limited catalogue, not a clinical ranking.</p>{product && <><p><strong>Manufacturer skin-type label:</strong> {product.skinTypeEvidence.wording}<br />US variant · Captured {product.checked}.<br />Formula and tolerance must be checked locally.</p><a href={product.source} target="_blank" rel="noreferrer">Manufacturer label source ↗</a><p><strong>Captured ingredient list:</strong> {product.ingredients.join(", ")}</p></>}<p>General routine guidance, not brand endorsement:</p><ul>{step.evidence.map(e => <li key={e.id}><a href={e.url} target="_blank" rel="noreferrer">{e.title} ↗</a></li>)}</ul></details>{step.alternative && <button className="alternative-button" onClick={() => setAlternative(!alternative)}>{alternative ? 'Back to first option' : 'See another option'} <Icon name="arrow" size={15} /></button>}</article>;
}
