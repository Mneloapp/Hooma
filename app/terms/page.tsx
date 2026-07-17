import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "@/components/LocalizedText";

export const metadata: Metadata = {
  title: "გამოყენების პირობები | Hooma",
  description: "Hooma-ს ონლაინ პლატფორმისა და შეკვეთით დამზადების სერვისის გამოყენების ძირითადი პირობები.",
};

const sections = [
  {
    title: "პლატფორმის გამოყენება",
    copy: "Hooma-ს გამოყენებისას მომხმარებელი ვალდებულია მიუთითოს სწორი საკონტაქტო და მიწოდების ინფორმაცია, დაიცვას ანგარიშის უსაფრთხოება და არ გამოიყენოს პლატფორმა უკანონო, თაღლითური ან სხვა პირის უფლებების დამრღვევი მიზნით.",
  },
  {
    title: "შეკვეთა და წარმოება",
    copy: "პროდუქტები მზადდება შეკვეთის მიხედვით. წარმოება იწყება შეკვეთისა და გადახდის შესაბამისი სტატუსის დადასტურების შემდეგ. 3 სამუშაო დღის მიზნობრივი ვადა შეიძლება შეიცვალოს პროდუქტის სირთულის, მასალის ხელმისაწვდომობის, შეკვეთის მოცულობის ან მიწოდების გარემოების გამო; არსებითი ცვლილებისას მომხმარებელს ვაცნობებთ.",
  },
  {
    title: "პროდუქტის მახასიათებლები",
    copy: "ციფრულ გამოსახულებასა და დამზადებულ ნივთს შორის შესაძლებელია უმნიშვნელო განსხვავება ფერში, ზედაპირის ტექსტურაში ან წარმოებისთვის ბუნებრივ დეტალებში. პროდუქტის გვერდზე მითითებული გამოყენების წესები და უსაფრთხოების შეზღუდვები მომხმარებელმა უნდა გაითვალისწინოს.",
  },
  {
    title: "ფასი და გადახდა",
    copy: "საბოლოო ფასი და მიწოდების საფასური ნაჩვენებია შეკვეთის დადასტურებამდე. რეალური ონლაინ გადახდის ჩართვის შემდეგ გადახდას დაამუშავებს ავტორიზებული საგადახდო პარტნიორი; Hooma არ შეინახავს საბანკო ბარათის სრულ მონაცემებს.",
  },
  {
    title: "ინდივიდუალური შეკვეთები",
    copy: "ფაილის ან სხვა მასალის ატვირთვით მომხმარებელი ადასტურებს, რომ აქვს მისი გამოყენებისა და დამზადებისთვის გადაცემის უფლება. Hooma-ს შეუძლია უარი თქვას მოთხოვნაზე, რომლის წარმოება ტექნიკურად შეუძლებელი, სახიფათო ან უკანონოა.",
  },
  {
    title: "დაბრუნება და პრეტენზია",
    copy: "ხარვეზის, დაზიანების ან შეკვეთასთან შეუსაბამობის შემთხვევაში მომხმარებელმა უნდა დაგვიკავშირდეს გონივრულ ვადაში და მოგვაწოდოს შეკვეთის მონაცემები. თითოეულ შემთხვევას პროდუქტის ტიპისა და მოქმედი სავალდებულო სამომხმარებლო წესების შესაბამისად განვიხილავთ. ეს პირობები არ ზღუდავს მომხმარებლის კანონით მინიჭებულ უფლებებს.",
  },
  {
    title: "პასუხისმგებლობა და ხელმისაწვდომობა",
    copy: "ვცდილობთ პლატფორმის მონაცემები იყოს ზუსტი და სერვისი — უწყვეტი, თუმცა სატესტო ან ტექნიკური სამუშაოების დროს შესაძლებელია დროებითი შეფერხება. პასუხისმგებლობის ნებისმიერი შეზღუდვა მოქმედებს მხოლოდ კანონით დაშვებულ ფარგლებში.",
  },
  {
    title: "პირობების განახლება",
    copy: "სერვისის განვითარებასთან ერთად პირობები შეიძლება განახლდეს. მოქმედი ვერსია და განახლების თარიღი ყოველთვის ამ გვერდზე გამოქვეყნდება.",
  },
];

const sectionsEn = [
  { title: "Using the platform", copy: "When using Hooma, you must provide accurate contact and delivery information, protect your account, and not use the platform for illegal, fraudulent, or rights-infringing activity." },
  { title: "Orders and production", copy: "Products are made to order. Production begins after the relevant order and payment status is confirmed. The three-business-day target may change because of product complexity, material availability, order volume, or delivery conditions; we will notify you of material changes." },
  { title: "Product characteristics", copy: "Minor differences in color, surface texture, or natural production details may occur between digital images and the finished item. Follow the usage and safety instructions shown on the product page." },
  { title: "Prices and payment", copy: "The final price and delivery fee are shown before order confirmation. Once live online payments are enabled, an authorized payment partner will process them; Hooma will not store full payment-card details." },
  { title: "Custom orders", copy: "By uploading a file or other material, you confirm that you have the right to provide it for use and production. Hooma may reject requests that are technically impossible, unsafe, or illegal to produce." },
  { title: "Returns and complaints", copy: "For defects, damage, or mismatch with an order, contact us within a reasonable period and provide the order details. Each case is reviewed according to the product type and mandatory consumer-protection rules. These terms do not limit your statutory rights." },
  { title: "Liability and availability", copy: "We work to keep platform information accurate and the service available, but temporary interruptions may occur during testing or maintenance. Any limitation of liability applies only to the extent permitted by law." },
  { title: "Updates to these terms", copy: "These terms may change as the service develops. The current version and update date will always be published on this page." },
];

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-hooma-accent"><LocalizedText ka="Hooma-ს პირობები" en="Hooma terms" /></p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl"><LocalizedText ka="გამოყენების პირობები" en="Terms of use" /></h1>
      <p className="mt-4 text-sm text-hooma-muted"><LocalizedText ka="ბოლო განახლება: 16 ივლისი, 2026" en="Last updated: July 16, 2026" /></p>
      <p className="mt-8 text-lg leading-8 text-hooma-muted">
        <LocalizedText ka="ეს პირობები არეგულირებს Hooma-ს ონლაინ პლატფორმითა და შეკვეთით დამზადების სერვისით სარგებლობას." en="These terms govern the use of Hooma’s online platform and made-to-order service." />
      </p>

      <div className="mt-12 space-y-10">
        {sections.map((section, index) => (
          <article key={section.title}>
            <h2 className="text-2xl font-semibold tracking-tight"><LocalizedText ka={section.title} en={sectionsEn[index].title} /></h2>
            <p className="mt-3 leading-7 text-hooma-muted"><LocalizedText ka={section.copy} en={sectionsEn[index].copy} /></p>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-[2rem] bg-white/70 p-6 shadow-soft">
        <h2 className="text-xl font-semibold"><LocalizedText ka="კითხვა ან პრეტენზია" en="Questions or complaints" /></h2>
        <p className="mt-3 leading-7 text-hooma-muted"><LocalizedText ka="შეკვეთასთან ან ამ პირობებთან დაკავშირებული საკითხისთვის გამოიყენე Hooma-ს საკონტაქტო გვერდი." en="For questions about an order or these terms, use Hooma’s contact page." /></p>
        <Link href="/contact" className="mt-5 inline-flex rounded-full bg-hooma-text px-5 py-3 text-sm font-semibold text-white"><LocalizedText ka="დაგვიკავშირდი" en="Contact us" /></Link>
      </div>
    </section>
  );
}
