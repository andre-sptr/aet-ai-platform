import { ModelTestPanel } from "../../../components/admin/ModelTestPanel";

export default function AdminModelTestPage() {
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Pengujian manual</p>
          <h1>Uji model AI.</h1>
          <p>Muat ulang daftar model Sumopod, lalu uji respons model pilihan.</p>
        </div>
      </div>
      <ModelTestPanel />
    </>
  );
}
