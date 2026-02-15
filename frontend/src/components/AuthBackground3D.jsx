import { motion } from 'framer-motion';

const floatingOrbs = [
    { id: 1, className: 'auth-orb auth-orb-1', duration: 12 },
    { id: 2, className: 'auth-orb auth-orb-2', duration: 16 },
    { id: 3, className: 'auth-orb auth-orb-3', duration: 14 },
];

export default function AuthBackground3D() {
    return (
        <div className="auth-3d-scene" aria-hidden="true">
            <div className="auth-grid" />
            {floatingOrbs.map((orb) => (
                <motion.div
                    key={orb.id}
                    className={orb.className}
                    animate={{ y: [0, -18, 0], rotate: [0, 8, -8, 0] }}
                    transition={{ duration: orb.duration, repeat: Infinity, ease: 'easeInOut' }}
                />
            ))}
            <motion.div
                className="auth-ring"
                animate={{ rotateX: [68, 73, 68], rotateZ: [0, 180, 360] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            />
        </div>
    );
}
