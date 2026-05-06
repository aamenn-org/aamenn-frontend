const AuthBackground = ({ currentImage }) => {
  return (
    <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 relative overflow-hidden">
      {/* Logo */}
      <div className="absolute top-8 left-8 z-10">
        <div className="text-white text-2xl font-bold">آمِن</div>
      </div>

      {/* Background Image */}
      <div className="absolute inset-0">
        <img 
          src={currentImage}
          alt="Family memories"
          className="w-full h-full object-cover transition-opacity duration-500"
        />
        <div className="absolute inset-0 bg-black/40"></div>
      </div>
    </div>
  );
};

export default AuthBackground;
