'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Code2, Cpu } from 'lucide-react';
import Link from 'next/link';

const insights = [
  {
    icon: Sparkles,
    title: 'The Future of AI-Assisted Development',
    excerpt: 'Exploring how large language models are reshaping the way developers write, debug, and ship code faster than ever.',
    href: '#',
  },
  {
    icon: Code2,
    title: 'Building Production-Ready ML Pipelines',
    excerpt: 'A comprehensive guide to designing scalable machine learning infrastructure that actually works in production.',
    href: '#',
  },
  {
    icon: Cpu,
    title: 'Edge Computing Meets AI',
    excerpt: 'How on-device machine learning is enabling new categories of applications with privacy and performance benefits.',
    href: '#',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
};

export function InsightsSection() {
  return (
    <section id="insights" className="py-24 px-6 relative bg-[#F2F2F7]">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-[#1C1C1E] mb-3">
            YUV.AI Insights
          </h2>
          <p className="text-[#1C1C1E]/60 text-lg max-w-xl">
            Thoughts and perspectives on AI, development, and building the future
          </p>
        </motion.div>

        {/* Insights Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {insights.map((insight, index) => {
            const IconComponent = insight.icon;
            return (
              <motion.div key={index} variants={itemVariants}>
                <Link href={insight.href}>
                  <div className="glass-light shadow-glass rounded-[16px] p-6 h-full group hover-lift">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-[#FF4D8E]/10 flex items-center justify-center mb-5 group-hover:bg-[#FF4D8E]/20 transition-colors">
                      <IconComponent className="w-6 h-6 text-[#FF4D8E]" />
                    </div>

                    {/* Content */}
                    <h3 className="text-lg font-semibold text-[#1C1C1E] mb-3 group-hover:text-[#FF4D8E] transition-colors">
                      {insight.title}
                    </h3>
                    <p className="text-sm text-[#1C1C1E]/60 mb-5 line-clamp-3">
                      {insight.excerpt}
                    </p>

                    {/* Learn More Link */}
                    <div className="flex items-center gap-2 text-[#FF4D8E] text-sm font-medium">
                      Learn More
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
