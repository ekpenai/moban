import React from 'react';

const PORTRAIT_URL =
  'https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=800&q=80';

export default function MobileEditorPixelMock() {
  return (
    <div className="min-h-screen w-full bg-[#f5f5f5] flex items-center justify-center p-4">
      <div className="relative w-[390px] max-w-full h-[844px] bg-[#f5f5f5] rounded-[34px] overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
        <div className="h-[44px]" />

        <header className="h-[44px] bg-white border-b border-[#eee] px-4 flex items-center justify-between">
          <button className="w-8 h-8 flex items-center justify-center text-[#1f2937] active:scale-[0.96] transition-transform">
            <span className="text-[24px] leading-none -mt-[2px]">&#x2039;</span>
          </button>

          <h1 className="text-[15px] font-medium text-[#111827]">web</h1>

          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded-full bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center active:scale-[0.96] transition-transform">
              <span className="text-[16px] tracking-[-1px] text-[#111827]">...</span>
            </button>
            <button className="w-8 h-8 rounded-full bg-[#f3f4f6] border border-[#e5e7eb] flex items-center justify-center active:scale-[0.96] transition-transform">
              <span className="block w-[13px] h-[13px] rounded-full border-2 border-[#111827]" />
            </button>
          </div>
        </header>

        <main className="absolute left-4 right-4 top-[104px] bottom-[94px] bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.08)] p-5">
          <div className="w-full h-full rounded-2xl bg-[#eceef3] flex flex-col items-center pt-5 pb-4 overflow-hidden">
            <p className="text-[28px] leading-none text-[#1f2937] mb-2 tracking-wide">تيبوا شاقفرا</p>

            <div className="relative w-[180px] h-[180px] rounded-full overflow-hidden">
              <img src={PORTRAIT_URL} alt="portrait" className="w-full h-full object-cover" />
              <div className="pointer-events-none absolute inset-0 rounded-full ring-[16px] ring-[#edf4ef]/90" />
            </div>

            <div className="mt-7 w-[140px] h-[140px] rounded-2xl overflow-hidden">
              <img src={PORTRAIT_URL} alt="preview" className="w-full h-full object-cover" />
            </div>

            <p className="mt-3 text-[14px] text-[#999] text-center">点击图片或下方的文字替换内容</p>

            <div className="mt-3 w-[80%] h-[14px] rounded-full bg-[#6ea8fe]" />
            <div className="mt-3 w-[80%] h-[14px] rounded-full bg-[#6ea8fe]" />
            <div className="mt-3 w-[80%] h-[14px] rounded-full bg-[#6ea8fe]" />
          </div>
        </main>

        <footer className="absolute left-0 right-0 bottom-0 bg-[#f5f5f5] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <div className="flex gap-3">
            <button className="flex-1 h-11 rounded-full bg-[#e0e0e0] text-[#333] text-[18px] font-semibold active:scale-[0.96] transition-transform">
              编辑
            </button>
            <button className="flex-1 h-11 rounded-full bg-[#e0e0e0] text-[#333] text-[18px] font-semibold active:scale-[0.96] transition-transform">
              草稿
            </button>
            <button className="flex-1 h-11 rounded-full bg-[#e0e0e0] text-[#333] text-[18px] font-semibold active:scale-[0.96] transition-transform">
              保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
