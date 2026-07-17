import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "@/components/LocalizedText";

export const metadata: Metadata = {
  title: "კონფიდენციალურობის პოლიტიკა | Hooma",
  description: "როგორ აგროვებს, იყენებს და იცავს Hooma მომხმარებლის პერსონალურ მონაცემებს.",
};

const sections = [
  {
    title: "რა მონაცემებს ვამუშავებთ",
    copy: "ანგარიშის შექმნისა და შეკვეთის შესრულებისთვის შესაძლოა დავამუშავოთ სახელი, ელფოსტა, ტელეფონი, მიწოდების მისამართი, შეკვეთებისა და გადახდის სტატუსის ისტორია, ინდივიდუალური შეკვეთის ფაილები და პლატფორმის უსაფრთხოებისთვის საჭირო ტექნიკური ჩანაწერები. Hooma არ ინახავს საბანკო ბარათის სრულ მონაცემებს.",
  },
  {
    title: "რისთვის ვიყენებთ მონაცემებს",
    copy: "მონაცემები გამოიყენება ანგარიშის სამართავად, შეკვეთის მისაღებად და დასამზადებლად, მიწოდებისა და ტრეკინგისთვის, მომხმარებელთან კომუნიკაციისთვის, თაღლითობის პრევენციისთვის, სერვისის გასაუმჯობესებლად და კანონით გათვალისწინებული საბუღალტრო თუ საგადასახადო ვალდებულებების შესასრულებლად.",
  },
  {
    title: "Google-ით ავტორიზაცია",
    copy: "Google-ით შესვლისას Hooma ითხოვს მხოლოდ ავტორიზაციისთვის აუცილებელ საბაზისო მონაცემებს: ანგარიშის იდენტიფიკატორს, სახელს, ელფოსტასა და პროფილის სურათს, თუ ის ხელმისაწვდომია. Hooma არ ითხოვს Gmail-ის, Google Drive-ის ან სხვა Google სერვისების შიგთავსზე წვდომას.",
  },
  {
    title: "ვისთან შეიძლება გაზიარდეს მონაცემები",
    copy: "სერვისის მუშაობისთვის მონაცემები შეიძლება დამუშავდეს ჩვენს ტექნიკურ მომწოდებლებთან, მათ შორის ჰოსტინგის, მონაცემთა ბაზის, ავტორიზაციისა და ტრანზაქციული ელფოსტის პროვაიდერებთან. შეკვეთის შესრულებისას საჭირო ნაწილი შეიძლება გადაეცეს გადახდის ან საკურიერო პარტნიორს, ხოლო კანონით მოთხოვნილი ინფორმაცია — ბუღალტერს ან უფლებამოსილ ორგანოს. პერსონალურ მონაცემებს არ ვყიდით.",
  },
  {
    title: "შენახვა და უსაფრთხოება",
    copy: "მონაცემებს ვინახავთ იმ ვადით, რაც საჭიროა ანგარიშის, შეკვეთისა და სამართლებრივი ვალდებულებების შესასრულებლად. ვიყენებთ წვდომის შეზღუდვას, დაშიფრულ კავშირს და როლებზე დაფუძნებულ უფლებებს. ინტერნეტში მონაცემთა გადაცემის არც ერთი მეთოდი არ არის აბსოლუტურად ურისკო, ამიტომ უსაფრთხოების ზომებს მუდმივად ვაახლებთ.",
  },
  {
    title: "შენი უფლებები",
    copy: "შეგიძლია მოითხოვო შენ შესახებ დაცული მონაცემების გაცნობა, შესწორება ან კანონით დაშვებულ ფარგლებში წაშლა. ასევე შეგიძლია გააუქმო ანგარიში ან Google-თან დაკავშირებული ავტორიზაცია. მოთხოვნისთვის გამოიყენე Hooma-ს საკონტაქტო გვერდი.",
  },
  {
    title: "Cookies და სესია",
    copy: "Hooma იყენებს ავტორიზაციის სესიის cookies-სა და ბრაუზერის ლოკალურ საცავს ანგარიშში შესვლის, კალათის, ენისა და მიწოდების ქალაქის დასამახსოვრებლად. აუცილებელი cookies-ის გარეშე ანგარიშის ზოგი ფუნქცია ვერ იმუშავებს.",
  },
  {
    title: "პოლიტიკის ცვლილება",
    copy: "პლატფორმის ან სამართლებრივი მოთხოვნების ცვლილებისას ეს პოლიტიკა შეიძლება განახლდეს. მოქმედი ვერსია ყოველთვის ამ გვერდზე გამოქვეყნდება განახლების თარიღთან ერთად.",
  },
];

const sectionsEn = [
  { title: "Data we process", copy: "To create an account and fulfill an order, we may process your name, email, phone number, delivery address, order and payment-status history, custom-order files, and technical records needed for platform security. Hooma does not store full payment-card details." },
  { title: "How we use data", copy: "We use data to manage accounts, receive and produce orders, provide delivery and tracking, communicate with customers, prevent fraud, improve the service, and meet legal accounting and tax obligations." },
  { title: "Google sign-in", copy: "When you sign in with Google, Hooma requests only the basic information needed for authentication: account identifier, name, email, and profile image when available. Hooma does not request access to Gmail, Google Drive, or content from other Google services." },
  { title: "Who may process data", copy: "Our technical providers may process data to operate hosting, databases, authentication, and transactional email. Information required to fulfill an order may be shared with payment or courier partners, and legally required information with an accountant or competent authority. We do not sell personal data." },
  { title: "Retention and security", copy: "We retain data for as long as needed to manage accounts, fulfill orders, and meet legal obligations. We use access controls, encrypted connections, and role-based permissions. No internet transmission method is entirely risk-free, so we continuously update our security measures." },
  { title: "Your rights", copy: "You can request access to, correction of, or—where permitted by law—deletion of your stored data. You can also close your account or revoke Google-linked authorization. Use the Hooma contact page to submit a request." },
  { title: "Cookies and sessions", copy: "Hooma uses authentication-session cookies and browser local storage to remember sign-in, cart contents, language, and delivery city. Some account features cannot work without essential cookies." },
  { title: "Policy changes", copy: "We may update this policy when the platform or legal requirements change. The current version and its update date will always be published on this page." },
];

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-hooma-accent"><LocalizedText ka="Hooma-ს კონფიდენციალურობა" en="Hooma privacy" /></p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl"><LocalizedText ka="კონფიდენციალურობის პოლიტიკა" en="Privacy policy" /></h1>
      <p className="mt-4 text-sm text-hooma-muted"><LocalizedText ka="ბოლო განახლება: 16 ივლისი, 2026" en="Last updated: July 16, 2026" /></p>
      <p className="mt-8 text-lg leading-8 text-hooma-muted">
        <LocalizedText ka="ეს პოლიტიკა განმარტავს, როგორ ამუშავებს Hooma მომხმარებლის პერსონალურ მონაცემებს ონლაინ მაღაზიისა და მასთან დაკავშირებული სერვისების მუშაობისას." en="This policy explains how Hooma processes personal data while operating its online store and related services." />
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
        <h2 className="text-xl font-semibold"><LocalizedText ka="კონტაქტი" en="Contact" /></h2>
        <p className="mt-3 leading-7 text-hooma-muted">
          <LocalizedText ka="პერსონალურ მონაცემებთან დაკავშირებული შეკითხვის ან მოთხოვნისთვის დაგვიკავშირდი Hooma-ს საკონტაქტო გვერდიდან." en="For questions or requests about personal data, contact us through Hooma’s contact page." />
        </p>
        <Link href="/contact" className="mt-5 inline-flex rounded-full bg-hooma-text px-5 py-3 text-sm font-semibold text-white">
          <LocalizedText ka="დაგვიკავშირდი" en="Contact us" />
        </Link>
      </div>
    </section>
  );
}
