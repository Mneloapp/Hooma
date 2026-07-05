import { Badge } from "./Badge";

export function SectionTitle({
  eyebrow,
  title,
  copy,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      {eyebrow ? <Badge>{eyebrow}</Badge> : null}
      <h2 className="mt-4 text-3xl font-semibold tracking-normal text-hooma-text md:text-5xl">{title}</h2>
      {copy ? <p className="mt-4 text-base leading-7 text-hooma-muted md:text-lg">{copy}</p> : null}
    </div>
  );
}
