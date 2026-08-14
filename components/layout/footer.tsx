'use client';

import Link from 'next/link';
import { Github, Linkedin, Twitter, Mail } from 'lucide-react';

const footerLinks = [
  { href: '/about', label: 'About' },
  // Three clicks deep inside About, and the pages there worth reaching in one —
  // which is why they are in the footer and not in the navbar's nine.
  { href: '/about/management/finance', label: 'Finance' },
  { href: '/about/management/presentation', label: 'Presentation' },
  { href: '/about/management/lifestyle', label: 'Lifestyle' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/routines', label: 'Routines' },
  { href: '#insights', label: 'AI & Dev' },
  { href: '/document', label: 'Documents' },
  { href: '/backup', label: 'Data' },
  { href: '/contact', label: 'Contact' },
];

// Point home until the real accounts exist — see the note in cta-section.tsx.
const socialLinks = [
  { href: '/', icon: Github, label: 'GitHub' },
  { href: '/', icon: Linkedin, label: 'LinkedIn' },
  { href: '/', icon: Twitter, label: 'Twitter' },
  { href: '/', icon: Mail, label: 'Email' },
];

function PhoenixLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="phoenixGradientFooter" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF4D8E" />
          <stop offset="50%" stopColor="#FF4D8E" />
          <stop offset="100%" stopColor="#FF9100" />
        </linearGradient>
      </defs>
      <path
        d="M50 10C35 10 25 25 25 40C25 50 30 58 38 63C30 68 25 78 25 88C35 85 45 78 50 68C55 78 65 85 75 88C75 78 70 68 62 63C70 58 75 50 75 40C75 25 65 10 50 10Z"
        fill="url(#phoenixGradientFooter)"
      />
      <path
        d="M50 20C42 20 36 28 36 38C36 45 40 51 46 55C50 58 50 68 50 68C50 68 50 58 54 55C60 51 64 45 64 38C64 28 58 20 50 20Z"
        fill="white"
        fillOpacity="0.3"
      />
    </svg>
  );
}

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="contact" className="py-12 px-6 bg-[#1C1C1E]">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center gap-8">
          {/* Logo and Tagline */}
          <div className="flex flex-col items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <PhoenixLogo className="w-8 h-8" />
              <span className="text-xl font-semibold text-white">DVIR.AI</span>
            </Link>
            <p className="text-white/50 text-sm">Fly High With DVIR.AI</p>
          </div>

          {/* Navigation Links */}
          {/* Wrapping, and a smaller gap: ten links in one unwrapped row ran
              off the side of a phone long before the tenth was added. */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Social Links */}
          <div className="flex items-center gap-5">
            {socialLinks.map((social) => {
              const IconComponent = social.icon;
              return (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-[#FF4D8E] hover:bg-white/10 transition-all"
                  aria-label={social.label}
                >
                  <IconComponent className="w-5 h-5" />
                </a>
              );
            })}
          </div>

          {/* Copyright */}
          <div className="pt-4 border-t border-white/10 w-full text-center">
            <p className="text-sm text-white/40">
              &copy; {currentYear} DVIR.AI. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
