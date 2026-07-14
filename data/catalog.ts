import {
  CarFront,
  Gift,
  House,
  Laptop,
  PawPrint,
  Puzzle,
  Utensils,
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

export const catalogCategories: CatalogCategory[] = [
  {
    slug: "home-organization",
    name: "Home & Organization",
    nameKa: "სახლი და ორგანიზება",
    description: "Useful details that give everyday things a clear place.",
    icon: House,
    subcategories: [
      { slug: "storage-organizers", name: "Storage & organizers", nameKa: "შენახვა და ორგანიზება" },
      { slug: "hooks-mounts", name: "Hooks & mounts", nameKa: "კავები და სამაგრები" },
      { slug: "bathroom", name: "Bathroom", nameKa: "აბაზანა" },
      { slug: "plant-accessories", name: "Plant accessories", nameKa: "მცენარის აქსესუარები" },
    ],
  },
  {
    slug: "desk-tech",
    name: "Desk & Tech",
    nameKa: "სამუშაო სივრცე და ტექნიკა",
    description: "Stands, docks, and organizers for a calmer workspace.",
    icon: Laptop,
    subcategories: [
      { slug: "phone-stands", name: "Phone stands", nameKa: "ტელეფონის სადგამები" },
      { slug: "laptop-tablet-stands", name: "Laptop & tablet stands", nameKa: "ლეპტოპისა და ტაბლეტის სადგამები" },
      { slug: "cable-management", name: "Cable management", nameKa: "კაბელების ორგანიზება" },
      { slug: "gaming-accessories", name: "Gaming accessories", nameKa: "გეიმინგ აქსესუარები" },
    ],
  },
  {
    slug: "kitchen",
    name: "Kitchen",
    nameKa: "სამზარეულო",
    description: "Small tools and organizers built around real routines.",
    icon: Utensils,
    subcategories: [
      { slug: "kitchen-organizers", name: "Organizers", nameKa: "ორგანაიზერები" },
      { slug: "tools-helpers", name: "Tools & helpers", nameKa: "ხელსაწყოები და დამხმარეები" },
      { slug: "coffee-bar", name: "Coffee & bar", nameKa: "ყავა და ბარი" },
      { slug: "kitchen-storage", name: "Storage", nameKa: "შენახვა" },
    ],
  },
  {
    slug: "kids-learning",
    name: "Kids & Learning",
    nameKa: "ბავშვები და სწავლა",
    description: "Creative, age-appropriate objects for play and learning.",
    icon: Puzzle,
    subcategories: [
      { slug: "montessori", name: "Montessori", nameKa: "მონტესორი" },
      { slug: "puzzles", name: "Puzzles", nameKa: "ფაზლები" },
      { slug: "creative-toys", name: "Creative toys", nameKa: "შემოქმედებითი სათამაშოები" },
      { slug: "kids-desk", name: "Desk accessories", nameKa: "საბავშვო სამუშაო სივრცე" },
    ],
  },
  {
    slug: "pets",
    name: "Pets",
    nameKa: "შინაური ცხოველები",
    description: "Thoughtful accessories for pets and the people around them.",
    icon: PawPrint,
    subcategories: [
      { slug: "pet-feeding", name: "Feeding", nameKa: "კვება" },
      { slug: "pet-organization", name: "Organization", nameKa: "ორგანიზება" },
      { slug: "pet-toys", name: "Toys", nameKa: "სათამაშოები" },
      { slug: "pet-personalized", name: "Personalized accessories", nameKa: "პერსონალიზებული აქსესუარები" },
    ],
  },
  {
    slug: "car-accessories",
    name: "Car Accessories",
    nameKa: "ავტომობილის აქსესუარები",
    description: "Model-specific organizers, mounts, and utility parts.",
    icon: CarFront,
    subcategories: [
      { slug: "console-organizers", name: "Console organizers", nameKa: "კონსოლის ორგანაიზერები" },
      { slug: "car-mounts", name: "Mounts", nameKa: "სამაგრები" },
      { slug: "car-storage", name: "Storage", nameKa: "შენახვა" },
      { slug: "car-utility", name: "Utility parts", nameKa: "დამხმარე დეტალები" },
    ],
  },
  {
    slug: "gifts-personalization",
    name: "Gifts & Personalization",
    nameKa: "საჩუქრები და პერსონალიზაცია",
    description: "Objects made personal with names, colors, and messages.",
    icon: Gift,
    subcategories: [
      { slug: "name-products", name: "Name products", nameKa: "სახელიანი ნივთები" },
      { slug: "desk-gifts", name: "Desk gifts", nameKa: "სამუშაო მაგიდის საჩუქრები" },
      { slug: "home-gifts", name: "Home gifts", nameKa: "სახლის საჩუქრები" },
      { slug: "seasonal", name: "Seasonal", nameKa: "სეზონური" },
    ],
  },
];

export const getCategory = (slug: string) => catalogCategories.find((category) => category.slug === slug);
