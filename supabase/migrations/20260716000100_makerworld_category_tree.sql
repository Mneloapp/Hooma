-- Replace the public catalog taxonomy with the Georgian category tree supplied
-- for Hooma. Existing rows are preserved for foreign-key safety and deactivated
-- after their products and import suggestions are mapped to the new tree.

insert into public.categories (
  parent_id,
  slug,
  name_en,
  name_ka,
  sort_order,
  is_active
)
values
  (null, '3d-printer', '3D Printer', '3D პრინტერი', 10, true),
  (null, 'art', 'Art', 'ხელოვნება', 20, true),
  (null, 'education', 'Education', 'განათლება', 30, true),
  (null, 'fashion', 'Fashion', 'მოდა', 40, true),
  (null, 'hobbies-diy', 'Hobby & DIY', 'ჰობი და საკუთარი ხელით კეთება', 50, true),
  (null, 'household', 'Household', 'საყოფაცხოვრებო', 60, true),
  (null, 'miniatures', 'Miniatures', 'მინიატურები', 70, true),
  (null, 'props-cosplay', 'Props & Cosplay', 'რეკვიზიტები და კოსფლეი', 80, true),
  (null, 'tools', 'Tools', 'ხელსაწყოები', 90, true),
  (null, 'toys-games', 'Toys & Games', 'სათამაშოები და თამაშები', 100, true),
  (null, 'generative-3d-model', 'Generative 3D Model', 'გენერაციული 3D მოდელი', 110, true)
on conflict (slug) do update set
  parent_id = null,
  name_en = excluded.name_en,
  name_ka = excluded.name_ka,
  sort_order = excluded.sort_order,
  is_active = true;

with child_values(parent_slug, slug, name_en, name_ka, sort_order) as (
  values
    ('3d-printer', '3d-printer-accessories', '3D Printer Accessories', '3D პრინტერის აქსესუარები', 11),
    ('3d-printer', '3d-printer-parts', '3D Printer Parts', '3D პრინტერის ნაწილები', 12),
    ('3d-printer', 'test-models', 'Test Models', 'სატესტო მოდელები', 13),

    ('art', '2d-art', '2D Art', '2D ხელოვნება', 21),
    ('art', 'coins-badges', 'Coins & Badges', 'მონეტები და სამკერდე ნიშნები', 22),
    ('art', 'signs-logos', 'Signs & Logos', 'ნიშნები და ლოგოები', 23),
    ('art', 'sculptures', 'Sculptures', 'ქანდაკებები', 24),
    ('art', 'other-art-models', 'Other Art Models', 'სხვა ხელოვნების მოდელები', 25),

    ('education', 'biology', 'Biology', 'ბიოლოგია', 31),
    ('education', 'chemistry', 'Chemistry', 'ქიმია', 32),
    ('education', 'engineering', 'Engineering', 'ინჟინერია', 33),
    ('education', 'geography', 'Geography', 'გეოგრაფია', 34),
    ('education', 'mathematics', 'Mathematics', 'მათემატიკა', 35),
    ('education', 'physics-astronomy', 'Physics & Astronomy', 'ფიზიკა და ასტრონომია', 36),
    ('education', 'other-educational-models', 'Other Educational Models', 'სხვა საგანმანათლებლო მოდელები', 37),

    ('fashion', 'bags', 'Bags', 'ჩანთები', 41),
    ('fashion', 'clothing', 'Clothing', 'ტანსაცმელი', 42),
    ('fashion', 'earrings', 'Earrings', 'საყურეები', 43),
    ('fashion', 'footwear', 'Footwear', 'ფეხსაცმელი', 44),
    ('fashion', 'glasses', 'Glasses', 'სათვალე', 45),
    ('fashion', 'jewelry', 'Jewelry', 'სამკაულები', 46),
    ('fashion', 'rings', 'Rings', 'ბეჭდები', 47),
    ('fashion', 'other-fashion-models', 'Other Fashion Models', 'სხვა მოდის მოდელები', 48),

    ('hobbies-diy', 'electronics', 'Electronics', 'ელექტრონიკა', 51),
    ('hobbies-diy', 'music', 'Music', 'მუსიკა', 52),
    ('hobbies-diy', 'rc', 'RC', 'RC', 53),
    ('hobbies-diy', 'robotics', 'Robotics', 'რობოტიკა', 54),
    ('hobbies-diy', 'sports-outdoors', 'Sports & Outdoors', 'სპორტი და ღია ცის ქვეშ', 55),
    ('hobbies-diy', 'vehicles', 'Vehicles', 'მანქანები', 56),
    ('hobbies-diy', 'other-hobbies-diy', 'Other Hobby & DIY Models', 'სხვა ჰობი და საკუთარი ხელით კეთების მოდელები', 57),

    ('household', 'decor', 'Decor', 'დეკორი', 61),
    ('household', 'holidays', 'Holidays', 'დღესასწაულები', 62),
    ('household', 'garden', 'Garden', 'ბაღი', 63),
    ('household', 'office', 'Office', 'ოფისი', 64),
    ('household', 'household-pets', 'Pets', 'შინაური ცხოველები', 65),
    ('household', 'other-household-models', 'Other Household Models', 'სხვა სახლის მოდელები', 66),

    ('miniatures', 'miniature-animals', 'Animals', 'ცხოველები', 71),
    ('miniatures', 'miniature-architecture', 'Architecture', 'არქიტექტურა', 72),
    ('miniatures', 'miniature-creatures', 'Creatures', 'არსებები', 73),
    ('miniatures', 'miniature-people', 'People', 'ხალხი', 74),
    ('miniatures', 'other-miniatures', 'Other Miniatures', 'სხვა მინიატურები', 75),

    ('props-cosplay', 'costumes', 'Costumes', 'კოსტიუმები', 81),
    ('props-cosplay', 'masks-helmets', 'Masks & Helmets', 'ნიღბები და ჩაფხუტები', 82),
    ('props-cosplay', 'cosplay-weapons', 'Cosplay Weapons', 'კოსფლეის იარაღები', 83),
    ('props-cosplay', 'other-props-cosplay', 'Other Props & Cosplay', 'სხვა რეკვიზიტები და კოსფლეი', 84),

    ('tools', 'gadgets', 'Gadgets', 'გაჯეტები', 91),
    ('tools', 'hand-tools', 'Hand Tools', 'ხელის ხელსაწყოები', 92),
    ('tools', 'fixtures', 'Fixtures', 'ჩარჩოები', 93),
    ('tools', 'measuring-tools', 'Measuring Tools', 'საზომი ინსტრუმენტები', 94),
    ('tools', 'medical-tools', 'Medical Instruments', 'სამედიცინო ინსტრუმენტები', 95),
    ('tools', 'organizers', 'Organizers', 'ორგანიზატორები', 96),
    ('tools', 'other-tools', 'Other Tools', 'სხვა ინსტრუმენტები', 97),

    ('toys-games', 'board-games', 'Board Games', 'სამაგიდო თამაშები', 101),
    ('toys-games', 'characters', 'Characters', 'პერსონაჟები', 102),
    ('toys-games', 'outdoor-toys', 'Outdoor Toys', 'გარე სათამაშოები', 103),
    ('toys-games', 'toy-puzzles', 'Puzzles', 'თავსატეხები', 104),
    ('toys-games', 'construction-sets', 'Construction Sets', 'სამშენებლო ნაკრებები', 105),
    ('toys-games', 'other-toys-games', 'Other Toys & Games', 'სხვა სათამაშოები და თამაშები', 106)
)
insert into public.categories (
  parent_id,
  slug,
  name_en,
  name_ka,
  sort_order,
  is_active
)
select
  parent.id,
  child.slug,
  child.name_en,
  child.name_ka,
  child.sort_order,
  true
from child_values child
join public.categories parent on parent.slug = child.parent_slug
on conflict (slug) do update set
  parent_id = excluded.parent_id,
  name_en = excluded.name_en,
  name_ka = excluded.name_ka,
  sort_order = excluded.sort_order,
  is_active = true;

-- Move records assigned to the previous taxonomy before it is deactivated.
do $$
declare
  mapping record;
  target_category_id uuid;
begin
  for mapping in
    select * from (values
      ('home-organization', 'other-household-models'),
      ('storage-organizers', 'organizers'),
      ('hooks-mounts', 'hand-tools'),
      ('bathroom', 'other-household-models'),
      ('plant-accessories', 'garden'),
      ('desk-tech', 'electronics'),
      ('phone-stands', 'electronics'),
      ('laptop-tablet-stands', 'electronics'),
      ('cable-management', 'electronics'),
      ('gaming-accessories', 'electronics'),
      ('kitchen', 'other-household-models'),
      ('kitchen-organizers', 'organizers'),
      ('tools-helpers', 'gadgets'),
      ('coffee-bar', 'other-household-models'),
      ('kitchen-storage', 'organizers'),
      ('kids-learning', 'other-educational-models'),
      ('montessori', 'other-educational-models'),
      ('puzzles', 'toy-puzzles'),
      ('creative-toys', 'other-toys-games'),
      ('kids-desk', 'office'),
      ('pets', 'household-pets'),
      ('pet-feeding', 'household-pets'),
      ('pet-organization', 'household-pets'),
      ('pet-toys', 'household-pets'),
      ('pet-personalized', 'household-pets'),
      ('car-accessories', 'vehicles'),
      ('console-organizers', 'vehicles'),
      ('car-mounts', 'vehicles'),
      ('car-storage', 'vehicles'),
      ('car-utility', 'vehicles'),
      ('gifts-personalization', 'other-art-models'),
      ('name-products', 'other-art-models'),
      ('desk-gifts', 'other-art-models'),
      ('home-gifts', 'decor'),
      ('seasonal', 'holidays')
    ) as category_mapping(source_slug, target_slug)
  loop
    select id into target_category_id
    from public.categories
    where slug = mapping.target_slug;

    update public.products product
    set category_id = target_category_id
    from public.categories current_category
    where product.category_id = current_category.id
      and current_category.slug = mapping.source_slug;

    update public.source_imports source_import
    set suggested_category_id = target_category_id
    from public.categories current_category
    where source_import.suggested_category_id = current_category.id
      and current_category.slug = mapping.source_slug;
  end loop;
end
$$;

-- Only the supplied 11-parent/58-child catalog remains selectable. The hidden
-- custom-order taxonomy and all retired catalog rows remain stored but inactive.
update public.categories
set is_active = false
where not (slug = any (array[
  '3d-printer', '3d-printer-accessories', '3d-printer-parts', 'test-models',
  'art', '2d-art', 'coins-badges', 'signs-logos', 'sculptures', 'other-art-models',
  'education', 'biology', 'chemistry', 'engineering', 'geography', 'mathematics', 'physics-astronomy', 'other-educational-models',
  'fashion', 'bags', 'clothing', 'earrings', 'footwear', 'glasses', 'jewelry', 'rings', 'other-fashion-models',
  'hobbies-diy', 'electronics', 'music', 'rc', 'robotics', 'sports-outdoors', 'vehicles', 'other-hobbies-diy',
  'household', 'decor', 'holidays', 'garden', 'office', 'household-pets', 'other-household-models',
  'miniatures', 'miniature-animals', 'miniature-architecture', 'miniature-creatures', 'miniature-people', 'other-miniatures',
  'props-cosplay', 'costumes', 'masks-helmets', 'cosplay-weapons', 'other-props-cosplay',
  'tools', 'gadgets', 'hand-tools', 'fixtures', 'measuring-tools', 'medical-tools', 'organizers', 'other-tools',
  'toys-games', 'board-games', 'characters', 'outdoor-toys', 'toy-puzzles', 'construction-sets', 'other-toys-games',
  'generative-3d-model'
]::text[]));

insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
select
  null,
  'catalog.category_tree_replaced',
  'category_tree',
  'hooma-2026-07-16',
  jsonb_build_object('parent_count', 11, 'subcategory_count', 58)
where not exists (
  select 1
  from public.audit_log
  where action = 'catalog.category_tree_replaced'
    and entity_id = 'hooma-2026-07-16'
);
