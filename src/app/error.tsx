'use client';
export default function ErrorPage({reset}:{reset:()=>void}) { return <main className="fatal"><h1>We couldn’t load this workspace.</h1><p>Try again below. Cases are saved in this browser, not backed up to the cloud. Do not clear site data to troubleshoot unless you have exported a backup.</p><button className="button primary" onClick={reset}>Try again</button></main>; }
