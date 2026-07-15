import {
  Castle,
  Drama,
  Gamepad2,
  GraduationCap,
  Hammer,
  House,
  Palette,
  Printer,
  Shirt,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type CatalogCategory = {
  slug: string;
  name: string;
  nameKa: string;
  description: string;
  icon: LucideIcon;
  subcategories: Array<{ slug: string; name: string; nameKa: string }>;
};

// Category names mirror the Georgian category tree supplied from MakerWorld.
// Slugs are Hooma-owned stable identifiers and are intentionally independent
// from any third-party URL structure.
export const catalogCategories: CatalogCategory[] = [
  {
    slug: "3d-printer",
    name: "3D Printer",
    nameKa: "3D პრინტერი",
    description: "Printer accessories, replacement parts, and calibration models.",
    icon: Printer,
    subcategories: [
      { slug: "3d-printer-accessories", name: "3D Printer Accessories", nameKa: "3D პრინტერის აქსესუარები" },
      { slug: "3d-printer-parts", name: "3D Printer Parts", nameKa: "3D პრინტერის ნაწილები" },
      { slug: "test-models", name: "Test Models", nameKa: "სატესტო მოდელები" },
    ],
  },
  {
    slug: "art",
    name: "Art",
    nameKa: "ხელოვნება",
    description: "Decorative, graphic, and sculptural objects.",
    icon: Palette,
    subcategories: [
      { slug: "2d-art", name: "2D Art", nameKa: "2D ხელოვნება" },
      { slug: "coins-badges", name: "Coins & Badges", nameKa: "მონეტები და სამკერდე ნიშნები" },
      { slug: "signs-logos", name: "Signs & Logos", nameKa: "ნიშნები და ლოგოები" },
      { slug: "sculptures", name: "Sculptures", nameKa: "ქანდაკებები" },
      { slug: "other-art-models", name: "Other Art Models", nameKa: "სხვა ხელოვნების მოდელები" },
    ],
  },
  {
    slug: "education",
    name: "Education",
    nameKa: "განათლება",
    description: "Models for explaining, learning, and demonstrating ideas.",
    icon: GraduationCap,
    subcategories: [
      { slug: "biology", name: "Biology", nameKa: "ბიოლოგია" },
      { slug: "chemistry", name: "Chemistry", nameKa: "ქიმია" },
      { slug: "engineering", name: "Engineering", nameKa: "ინჟინერია" },
      { slug: "geography", name: "Geography", nameKa: "გეოგრაფია" },
      { slug: "mathematics", name: "Mathematics", nameKa: "მათემატიკა" },
      { slug: "physics-astronomy", name: "Physics & Astronomy", nameKa: "ფიზიკა და ასტრონომია" },
      { slug: "other-educational-models", name: "Other Educational Models", nameKa: "სხვა საგანმანათლებლო მოდელები" },
    ],
  },
  {
    slug: "fashion",
    name: "Fashion",
    nameKa: "მოდა",
    description: "Wearable objects and personal accessories.",
    icon: Shirt,
    subcategories: [
      { slug: "bags", name: "Bags", nameKa: "ჩანთები" },
      { slug: "clothing", name: "Clothing", nameKa: "ტანსაცმელი" },
      { slug: "earrings", name: "Earrings", nameKa: "საყურეები" },
      { slug: "footwear", name: "Footwear", nameKa: "ფეხსაცმელი" },
      { slug: "glasses", name: "Glasses", nameKa: "სათვალე" },
      { slug: "jewelry", name: "Jewelry", nameKa: "სამკაულები" },
      { slug: "rings", name: "Rings", nameKa: "ბეჭდები" },
      { slug: "other-fashion-models", name: "Other Fashion Models", nameKa: "სხვა მოდის მოდელები" },
    ],
  },
  {
    slug: "hobbies-diy",
    name: "Hobby & DIY",
    nameKa: "ჰობი და საკუთარი ხელით კეთება",
    description: "Projects, components, and accessories for hands-on hobbies.",
    icon: Hammer,
    subcategories: [
      { slug: "electronics", name: "Electronics", nameKa: "ელექტრონიკა" },
      { slug: "music", name: "Music", nameKa: "მუსიკა" },
      { slug: "rc", name: "RC", nameKa: "RC" },
      { slug: "robotics", name: "Robotics", nameKa: "რობოტიკა" },
      { slug: "sports-outdoors", name: "Sports & Outdoors", nameKa: "სპორტი და ღია ცის ქვეშ" },
      { slug: "vehicles", name: "Vehicles", nameKa: "მანქანები" },
      { slug: "other-hobbies-diy", name: "Other Hobby & DIY Models", nameKa: "სხვა ჰობი და საკუთარი ხელით კეთების მოდელები" },
    ],
  },
  {
    slug: "household",
    name: "Household",
    nameKa: "საყოფაცხოვრებო",
    description: "Practical and decorative objects for everyday spaces.",
    icon: House,
    subcategories: [
      { slug: "decor", name: "Decor", nameKa: "დეკორი" },
      { slug: "holidays", name: "Holidays", nameKa: "დღესასწაულები" },
      { slug: "garden", name: "Garden", nameKa: "ბაღი" },
      { slug: "office", name: "Office", nameKa: "ოფისი" },
      { slug: "household-pets", name: "Pets", nameKa: "შინაური ცხოველები" },
      { slug: "other-household-models", name: "Other Household Models", nameKa: "სხვა სახლის მოდელები" },
    ],
  },
  {
    slug: "miniatures",
    name: "Miniatures",
    nameKa: "მინიატურები",
    description: "Small-scale figures, scenes, buildings, and creatures.",
    icon: Castle,
    subcategories: [
      { slug: "miniature-animals", name: "Animals", nameKa: "ცხოველები" },
      { slug: "miniature-architecture", name: "Architecture", nameKa: "არქიტექტურა" },
      { slug: "miniature-creatures", name: "Creatures", nameKa: "არსებები" },
      { slug: "miniature-people", name: "People", nameKa: "ხალხი" },
      { slug: "other-miniatures", name: "Other Miniatures", nameKa: "სხვა მინიატურები" },
    ],
  },
  {
    slug: "props-cosplay",
    name: "Props & Cosplay",
    nameKa: "რეკვიზიტები და კოსფლეი",
    description: "Costume pieces, character props, and cosplay accessories.",
    icon: Drama,
    subcategories: [
      { slug: "costumes", name: "Costumes", nameKa: "კოსტიუმები" },
      { slug: "masks-helmets", name: "Masks & Helmets", nameKa: "ნიღბები და ჩაფხუტები" },
      { slug: "cosplay-weapons", name: "Cosplay Weapons", nameKa: "კოსფლეის იარაღები" },
      { slug: "other-props-cosplay", name: "Other Props & Cosplay", nameKa: "სხვა რეკვიზიტები და კოსფლეი" },
    ],
  },
  {
    slug: "tools",
    name: "Tools",
    nameKa: "ხელსაწყოები",
    description: "Useful tools, fixtures, measuring aids, and organizers.",
    icon: Wrench,
    subcategories: [
      { slug: "gadgets", name: "Gadgets", nameKa: "გაჯეტები" },
      { slug: "hand-tools", name: "Hand Tools", nameKa: "ხელის ხელსაწყოები" },
      { slug: "fixtures", name: "Fixtures", nameKa: "ჩარჩოები" },
      { slug: "measuring-tools", name: "Measuring Tools", nameKa: "საზომი ინსტრუმენტები" },
      { slug: "medical-tools", name: "Medical Instruments", nameKa: "სამედიცინო ინსტრუმენტები" },
      { slug: "organizers", name: "Organizers", nameKa: "ორგანიზატორები" },
      { slug: "other-tools", name: "Other Tools", nameKa: "სხვა ინსტრუმენტები" },
    ],
  },
  {
    slug: "toys-games",
    name: "Toys & Games",
    nameKa: "სათამაშოები და თამაშები",
    description: "Play objects, puzzles, characters, and game components.",
    icon: Gamepad2,
    subcategories: [
      { slug: "board-games", name: "Board Games", nameKa: "სამაგიდო თამაშები" },
      { slug: "characters", name: "Characters", nameKa: "პერსონაჟები" },
      { slug: "outdoor-toys", name: "Outdoor Toys", nameKa: "გარე სათამაშოები" },
      { slug: "toy-puzzles", name: "Puzzles", nameKa: "თავსატეხები" },
      { slug: "construction-sets", name: "Construction Sets", nameKa: "სამშენებლო ნაკრებები" },
      { slug: "other-toys-games", name: "Other Toys & Games", nameKa: "სხვა სათამაშოები და თამაშები" },
    ],
  },
  {
    slug: "generative-3d-model",
    name: "Generative 3D Model",
    nameKa: "გენერაციული 3D მოდელი",
    description: "Parametric and algorithmically generated printable forms.",
    icon: Sparkles,
    subcategories: [],
  },
];

export const getCategory = (slug: string) => catalogCategories.find((category) => category.slug === slug);
