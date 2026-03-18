function CameraIframe() {
  // This embeds the camera's built-in web interface, which usually has
  // much lower latency than an HLS stream because it uses the camera's
  // own streaming method directly.
  const src = 'http://192.168.111.227/';

  return (
    <div style={{ width: '100%', maxWidth: '900px', height: '520px' }}>
      <iframe
        title="Dahua Camera Web"
        src={src}
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
}

export default CameraIframe;
