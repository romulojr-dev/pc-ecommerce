// The home page's opening banner: a dark, dot-gridded panel holding the
// page's only h1, with no buttons or label. It stays dark in both themes, so
// it uses fixed neutral values, not theme tokens. Geist is a variable font
// (next/font), so the light 300 and bold 700 are real weights.
export function HeroBanner() {
  return (
    <section
      aria-labelledby="hero-title"
      className="mt-8 rounded-lg border border-neutral-700 bg-neutral-950 [background-image:radial-gradient(#2A2A2A_1px,transparent_1px)] [background-size:14px_14px] px-6 py-8 text-neutral-50 md:px-12 md:py-11"
    >
      <h1
        id="hero-title"
        className="max-w-[820px] text-[40px] leading-[1.05] font-light tracking-[-0.035em] md:text-[56px]"
      >
        <strong className="font-bold">Build a PC</strong> that just{" "}
        <strong className="font-bold">works,</strong> with solid tech and&nbsp;
        <strong className="font-bold">solid value.</strong>
      </h1>
    </section>
  )
}
