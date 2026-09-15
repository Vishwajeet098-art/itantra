export function Impact() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Impact & Future Scope</h1>
      <p className="text-gray-400 mb-12 text-lg">Connecting the unconnected across the nation.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-2">Remote Area Connectivity</h3>
          <p className="text-gray-400">Enabling seamless communication in regions where high-bandwidth infrastructure is economically unviable or geographically impossible.</p>
        </div>
        
        <div className="bg-card border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-2">Disaster Relief</h3>
          <p className="text-gray-400">When primary networks fail, our low-bitrate text-encoded voice protocol can maintain critical communication lines via emergency radio.</p>
        </div>
        
        <div className="bg-card border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-2">Regional Language Support</h3>
          <p className="text-gray-400">Breaking the English barrier by providing real-time AI translation across 12+ Indian languages, empowering local populations.</p>
        </div>
        
        <div className="bg-card border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-2">Hardware Integration</h3>
          <p className="text-gray-400">Future scope involves directly integrating this neural transceiver stack with physical SDR (Software Defined Radio) modules for completely decentralized links.</p>
        </div>
      </div>
    </div>
  );
}
