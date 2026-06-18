import React from 'react';

// Avatar do usuário: mostra a FOTO só quando há uma URL enviada (Supabase
// Storage / http). Sem foto, mostra a INICIAL do nome num círculo colorido.
// (Cravei! não usa mais imagens de perfil estáticas — só foto enviada ou inicial.)

const COLORS = ['#009c3b', '#f5b300', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#ea580c'];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 40, className }) => {
  const isPhoto = !!src && /^https?:\/\//.test(src);
  if (isPhoto) {
    return (
      <img
        src={src as string}
        alt={name}
        className={className}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}
      />
    );
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={className}
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colorFor(name || '?'),
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {initial}
    </div>
  );
};

export default Avatar;
