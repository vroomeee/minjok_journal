export const loader = () =>
  new Response("Not Found", { status: 404 });

export default function WpSetupConfig() {
  return (
    <div className="page">
      <p style={{ margin: 24, fontSize: 18 }}>
        This site does not run WordPress. The requested path is invalid.
      </p>
    </div>
  );
}
