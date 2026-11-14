'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Braces, Code2, Cpu, FileText, GraduationCap, Layers, MapPin, MessageCircle, Paperclip, Send, Terminal } from 'lucide-react';
import PublicShell from './PublicShell';

const personas = [
  { id: 'daily', title: 'Smart Companion', label: 'Think & explore', description: 'Temukan sudut pandang baru. Diskusikan ide, susun rencana, dan selesaikan pertanyaan sehari-hari.', tags: ['Brainstorming', 'Rencana belajar', 'Diskusi cepat'], icon: MessageCircle },
  { id: 'report', title: 'Academic Writer', label: 'Research & write', description: 'Dari kerangka awal hingga analisis. Susun laporan dan tulisan akademik dengan alur yang lebih terarah.', tags: ['Kerangka laporan', 'Analisis', 'Ringkasan materi'], icon: FileText },
  { id: 'coding', title: 'Coding Expert', label: 'Build & understand', description: 'Pahami logikanya, pecahkan masalahnya. Tulis kode, telusuri bug, dan pelajari konsep teknis bersama AI.', tags: ['Debug', 'Logika algoritma', 'Sistem & IoT'], icon: Braces },
] as const;

const officialLinks = [
  ['https://tet.pcr.ac.id/', 'Program studi', 'tet.pcr.ac.id', 'PORTAL AKADEMIK'],
  ['https://www.instagram.com/aetpcr/', 'Instagram', '@aetpcr', 'UPDATE & KARYA'],
  ['https://www.youtube.com/@AETPCR', 'YouTube', 'AETPCR', 'VIDEO & DOKUMENTASI'],
  ['https://facebook.com/aetpcr/', 'Facebook', 'AET PCR', 'ARSIP KOMUNITAS'],
] as const;

export default function Landing({ onSelectPersona }: { onSelectPersona: (persona: 'daily' | 'report' | 'coding') => void }) {
  return (
    <PublicShell>
      <div className="landing-canvas">
        <section className="landing-hero">
          <div className="site-container">
          <div className="hero-layout">
            <div className="hero-copy">
              <div className="eyebrow"><span />Built for AET. Open to ideas.</div>
              <h1>Intelligence<br />for <em>every idea.</em></h1>
              <p>Ruang berpikir baru untuk mahasiswa AET PCR. Eksplorasi ide, tulis karya akademik, dan kembangkan kode bersama asisten AI dalam satu workspace.</p>
              <div className="hero-actions">
                <a href="#pilih-mode" className="button button-primary">Temukan mode <ArrowRight size={16} strokeWidth={2} /></a>
                <Link href="/team/" className="button button-secondary">Kenali AET PCR <ArrowUpRight size={15} strokeWidth={2} /></Link>
              </div>
              <div className="hero-note">
                <GraduationCap size={16} strokeWidth={1.9} />
                <span>Dirancang untuk belajar, berkarya, dan berkembang.</span>
              </div>
            </div>

            <div className="product-preview" aria-label="Pratinjau workspace AET AI">
              <div className="preview-top">
                <div className="preview-top-left">
                  <span className="preview-dots" aria-hidden="true"><i /><i /><i /></span>
                  <strong><Terminal size={14} strokeWidth={2} />AET AI Workspace</strong>
                </div>
                <span>PRATINJAU INTERFACE</span>
              </div>
              <div className="preview-session">
                <div className="preview-mode"><Code2 size={14} strokeWidth={2} />Coding Expert <span>/</span>Eksplorasi konsep</div>
                <div className="preview-user">Bantu jelaskan bagaimana sensor membaca data dan mengirimkannya ke sistem IoT.</div>
                <div className="preview-ai">
                  <div className="preview-avatar" aria-hidden="true"><Cpu size={15} strokeWidth={1.9} /></div>
                  <div className="preview-answer">
                    <strong>Dari data fisik menjadi informasi.</strong>
                    <ol>
                      <li>Sensor mengukur besaran di lingkungan.</li>
                      <li>Mikrokontroler membaca dan memproses data.</li>
                      <li>Data dikirim untuk ditampilkan atau dianalisis.</li>
                    </ol>
                    <pre className="preview-code"><code><span>sensor</span>.read(){'\n'}  ↳ process(data){'\n'}  ↳ <span>publish</span>(&quot;aet/sensor&quot;, data)</code></pre>
                  </div>
                </div>
              </div>
              <div className="preview-composer">
                <span><Paperclip size={14} strokeWidth={2} />Lanjutkan ide kamu...</span>
                <span className="preview-send" aria-hidden="true"><Send size={13} strokeWidth={2} /></span>
              </div>
              <p className="preview-caption">Diskusi · Penulisan akademik · Pengembangan kode</p>
            </div>
          </div>

          <div className="hero-bottom">
            <span><Layers size={15} strokeWidth={2} />Tiga mode, sesuai kebutuhanmu</span>
            <span><Cpu size={15} strokeWidth={2} />AI adaptif dalam satu workspace</span>
            <span><BookOpen size={15} strokeWidth={2} />Bagian dari komunitas AET PCR</span>
          </div>
        </div>
      </section>

      <section className="modes-section" id="pilih-mode">
        <div className="site-container">
          <div className="section-title-row">
            <div>
              <div className="eyebrow"><span />Pilih ruang berpikirmu</div>
              <h2>Satu ide. Banyak kemungkinan.</h2>
            </div>
            <p>Mulai dari yang kamu butuhkan hari ini.</p>
          </div>
          <div className="mode-grid">
            {personas.map((persona, index) => (
              <button className={`mode-card mode-${persona.id}`} key={persona.id} onClick={() => onSelectPersona(persona.id)} id={`chat-mode-${persona.id}`}>
                <div className="mode-card-top">
                  <div className="mode-icon"><persona.icon size={22} strokeWidth={1.75} /></div>
                  <span className="mode-index"><i aria-hidden="true" />0{index + 1} / AI MODE</span>
                </div>
                <small>{persona.label}</small>
                <h3>{persona.title}</h3>
                <p>{persona.description}</p>
                <div className="mode-tags" aria-hidden="true">
                  {persona.tags.map(tag => <span key={tag}>{tag}</span>)}
                </div>
                <div className="mode-card-bottom">
                  <span>Mulai percakapan</span>
                  <span className="mode-card-arrow" aria-hidden="true"><ArrowUpRight size={17} strokeWidth={2.1} /></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workflow">
        <div className="site-container workflow-layout">
          <div className="workflow-intro">
            <div className="eyebrow"><span />Dari pertanyaan ke pemahaman</div>
            <h2>Mulai sederhana.<br />Kembangkan bersama.</h2>
            <p>AI sebagai rekan berpikir. Kamu tetap memegang arah, konteks, dan keputusan akhirnya.</p>
            <div className="workflow-highlights">
              <div>
                <Paperclip size={15} strokeWidth={2} />
                <span><strong>Dukungan Konteks</strong> — Sertakan dokumen atau cuplikan kode langsung di percakapan.</span>
              </div>
              <div>
                <Cpu size={15} strokeWidth={2} />
                <span><strong>Penalaran Adaptif</strong> — Aktifkan mode Think saat butuh analisis lebih mendalam.</span>
              </div>
            </div>
            <a href="#pilih-mode" className="workflow-cta">Mulai dari pilih mode <ArrowUpRight size={15} strokeWidth={2} /></a>
          </div>
          <div className="workflow-steps">
            {[
              ['01', 'TAHAP 01 · FOKUS', 'Pilih fokusmu', 'Buka mode diskusi, akademik, atau coding sesuai pekerjaanmu.', 'Smart Companion · Academic Writer · Coding Expert'],
              ['02', 'TAHAP 02 · KONTEKS', 'Berikan konteks', 'Tulis pertanyaan atau sertakan dokumen untuk memperjelas kebutuhan.', 'Pertanyaan langsung · Lampiran file · Cuplikan kode'],
              ['03', 'TAHAP 03 · EKSPLORASI', 'Olah lebih lanjut', 'Tinjau jawaban, ajukan pertanyaan lanjutan, dan verifikasi hal penting.', 'Mode Think · Edit pesan · Riwayat tersimpan'],
            ].map(([number, badge, title, description, detail]) => (
              <div key={number} className="workflow-step">
                <span>{number}</span>
                <div>
                  <div className="workflow-step-head">
                    <h3>{title}</h3>
                    <small>{badge}</small>
                  </div>
                  <p>{description}</p>
                  <div className="workflow-step-meta">{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="community">
        <div className="site-container">
          <div className="community-layout">
            <div className="community-copy">
              <div className="eyebrow"><span />Teknologi bertemu komunitas</div>
              <h2>Tumbuh bersama<br />keluarga AET PCR.</h2>
              <p>Di balik setiap inovasi, ada orang-orang yang saling terhubung. Kenali Himpunan Mahasiswa AET Politeknik Caltex Riau melalui cerita, kegiatan, dan saluran resmi kami.</p>
              <div className="community-links">
                {officialLinks.map(([href, title, caption, tag]) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" key={href} className="community-link-card">
                    <div className="community-link-top">
                      <span className="community-link-tag">{tag}</span>
                      <span className="community-link-arrow" aria-hidden="true"><ArrowUpRight size={15} strokeWidth={2.1} /></span>
                    </div>
                    <strong>{title}</strong>
                    <small>{caption}</small>
                  </a>
                ))}
              </div>
              <div className="community-actions">
                <a href="/AETPCR.docx" className="community-doc-link" download>
                  <FileText size={15} strokeWidth={2} />
                  <span>Dokumen AET PCR</span>
                  <ArrowDown size={14} strokeWidth={2} />
                </a>
                <Link href="/events/" className="community-events-link">
                  Lihat agenda kegiatan <ArrowRight size={14} strokeWidth={2} />
                </Link>
              </div>
            </div>
            <div className="community-map">
              <div className="map-topbar">
                <span className="map-status"><i aria-hidden="true" />KAMPUS &amp; SEKRETARIAT</span>
                <span className="map-coords">PEKANBARU · RIAU</span>
              </div>
              <iframe title="Lokasi Politeknik Caltex Riau" src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3989.6202092674093!2d101.42609689999999!3d0.5709752!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31d5ab67086f2e89%3A0x65a24264fec306bb!2sPoliteknik%20Caltex%20Riau!5e0!3m2!1sid!2sid!4v1766210002355!5m2!1sid!2sid" loading="lazy" referrerPolicy="no-referrer" allowFullScreen />
              <div className="map-caption">
                <div className="map-pin-badge" aria-hidden="true"><MapPin size={19} strokeWidth={1.9} /></div>
                <div>
                  <strong>Politeknik Caltex Riau</strong>
                  <small>Pekanbaru, Riau · Indonesia</small>
                </div>
                <a href="https://www.google.com/maps/search/?api=1&query=Politeknik+Caltex+Riau" target="_blank" rel="noopener noreferrer" aria-label="Buka Politeknik Caltex Riau di Google Maps">
                  <ArrowUpRight size={17} strokeWidth={2} />
                </a>
              </div>
            </div>
          </div>

          <div className="final-cta">
            <div className="final-cta-copy">
              <div className="final-cta-eyebrow"><span />MULAI EKSPLORASI</div>
              <h2>Ide berikutnya dimulai dari kamu.</h2>
              <p>Ambil langkah pertama. Buka percakapan dan lihat ke mana idemu berkembang.</p>
            </div>
            <div className="final-cta-actions">
              <a href="#pilih-mode" className="button button-white">Jelajahi mode AI <ArrowUpRight size={16} strokeWidth={2} /></a>
              <Link href="/news/" className="button final-cta-secondary">Baca cerita AET <ArrowRight size={15} strokeWidth={2} /></Link>
            </div>
          </div>
        </div>
      </section>
      </div>
    </PublicShell>
  );
}
