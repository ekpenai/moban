declare module 'arabic-persian-reshaper' {
  const reshaper: {
    ArabicShaper: {
      convertArabic(input: string): string;
    };
    PersianShaper: {
      convertArabic(input: string): string;
    };
  };

  export default reshaper;
}
