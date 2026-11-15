import { AiAdminWorkspace } from "../../../components/admin/AiAdminWorkspace";

export default function AdminModelTestPage() {
  return (
    <>
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Pengaturan &amp; pengujian AI</p>
          <h1>Model &amp; konfigurasi AI.</h1>
          <p>
            Kelola model yang digunakan pada AET AI.
          </p>
        </div>
      </div>
      <AiAdminWorkspace />
    </>
  );
}
