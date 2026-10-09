# ชิ้นภาพหมู่บ้าน (ให้เจ้าของเกมสร้างด้วย AI แล้วส่งมา)

หมู่บ้านจะไม่เป็นรูปเดียวอีกแล้ว แต่ประกอบจากชิ้นๆ แบบเกม 2D จริง:
พื้นเป็นลายซ้ำความละเอียดสูง (คมทุกจอ) แล้ววางบ้าน ต้นไม้ รั้ว ของตกแต่งทับ
ตัวละครเดินหลังหลังคา/ต้นไม้ได้ น้ำไหล ต้นไม้ไหว ควันลอย

ผังหมู่บ้านใช้ภาพเดิมที่ส่งมา (ตำแหน่งบ้าน ถนน บ่อ นา คอกไก่) ผมวางชิ้นตามผังนั้นให้

## กติกาทุกชิ้น (สำคัญ)

1. **ไฟล์ PNG พื้นหลังโปร่งใส** ถ้าเครื่องมือทำโปร่งใสไม่ได้ ให้ใช้พื้นหลังสีเขียวสด `#00FF00` เรียบๆ ทั้งพื้น ผมตัดออกเอง
2. **มุมมองเดียวกันทุกชิ้น:** มองจากบนลงล่างเฉียง (top-down 3/4 แบบภาพหมู่บ้านที่ส่งมา) แสงมาจาก**ซ้ายบน**
3. **1 ไฟล์ = 1 ชิ้น** วางกลางภาพ เว้นขอบโปร่งใสนิดหน่อย ห้ามมีพื้นหญ้า/ดินรอบๆ ติดมา (ยกเว้นชิ้นที่บอกว่าเป็นลายพื้น)
4. **ไม่มีตัวหนังสือ ไม่มีลายน้ำ ไม่มีตัวละคร**
5. **ขนาด:** 1 ช่องในเกม = 64 พิกเซลในภาพ ขนาดในตารางคือขนาดขั้นต่ำ ใหญ่กว่าได้ (ผมย่อเอง) แต่สัดส่วนต้องใกล้เคียง
6. ทุก prompt ให้**แนบภาพหมู่บ้านเดิมเป็นภาพอ้างอิงสไตล์** (style reference) ถ้าเครื่องมือรองรับ

### ประโยคนำหน้าทุก prompt (ก๊อปไปใส่หน้าทุกอัน)

```
2D fantasy adventure RPG game asset, hand-painted style matching the reference image,
top-down 3/4 view, light from top-left, clean dark outlines, warm saturated colors,
single isolated object centered, transparent background (or flat #00FF00 background),
no ground, no text, no characters, high detail, sharp
```

## A. ลายพื้น (ต้องต่อกันได้ไร้รอยต่อ = seamless tileable)

ลายพื้นเป็นภาพสี่เหลี่ยมเต็มภาพ ไม่โปร่งใส ต้องต่อซ้ำซ้ายขวาบนล่างได้ไม่เห็นรอย
prompt ของกลุ่มนี้ใช้ประโยคนี้แทนประโยคนำหน้าด้านบน:

```
seamless tileable top-down ground texture for a 2D fantasy RPG, hand-painted style matching
the reference image, flat even lighting, no objects, no shadows, no perspective, fills the whole square
```

| ไฟล์ | ขนาด | prompt ต่อท้าย |
|---|---|---|
| `ground-grass.png` | 1024×1024 | lush bright green grass with subtle tufts and a few tiny flowers |
| `ground-grass-dark.png` | 1024×1024 | darker forest-floor grass with moss, fallen leaves |
| `ground-dirt.png` | 1024×1024 | packed light-brown dirt road, small pebbles, faint wheel ruts |
| `ground-plaza.png` | 1024×1024 | cream stone paving slabs, square tiles with thin grout lines |
| `ground-soil.png` | 512×512 | dark tilled farm soil in rows |
| `ground-water.png` | 1024×1024 | clear turquoise river water, gentle ripples, light sparkles |
| `ground-paddy.png` | 512×512 | flooded rice paddy, shallow water with young green rice shoots |
| `ground-rock.png` | 1024×1024 | top of a rocky brown cliff plateau, grassy patches |

## B. อาคาร

| ไฟล์ | ขนาดขั้นต่ำ | prompt ต่อท้าย |
|---|---|---|
| `smithy.png` | 320×420 | blacksmith workshop, orange clay tile hip roof, timber and plaster walls, stone forge with glowing fire at the front right, wooden door, barrel |
| `inn.png` | 448×420 | larger village inn and kitchen, orange clay tile hip roof with a side wing and stone chimney, windows with blue glass, wooden double door, small stone steps |
| `elder-house.png` | 384×360 | village elder's house, red-orange tile roof with a small chimney, cozy timber walls, flower box under the window |
| `hut-1.png` | 320×300 | thatched straw roof hut, wooden walls, small windows, vines on the roof |
| `hut-2.png` | 320×300 | thatched straw roof hut, slightly different, wooden porch |
| `granary.png` | 256×300 | small rice granary on stilts, orange tile roof |
| `henhouse.png` | 140×160 | small wooden chicken coop house on stilts with a thatched roof and a ramp |
| `sala.png` | 200×200 | small open Thai pavilion (sala) with a red tiered roof on four wooden posts |
| `field-hut.png` | 140×200 | small thatched field hut on stilts |

## C. ต้นไม้ พุ่มไม้ หิน

| ไฟล์ | ขนาดขั้นต่ำ | prompt ต่อท้าย |
|---|---|---|
| `tree-round-1.png` | 192×224 | round leafy broadleaf tree, full green crown, short brown trunk with roots |
| `tree-round-2.png` | 192×224 | another round leafy tree, slightly lighter green, different crown shape |
| `tree-round-3.png` | 160×192 | small young round tree |
| `tree-pine-1.png` | 160×256 | tall dark green pine / conifer tree |
| `tree-pine-2.png` | 128×208 | smaller pine tree |
| `bush-1.png` | 96×80 | round green bush |
| `bush-2.png` | 96×80 | flowering bush with small orange flowers |
| `rock-1.png` | 96×80 | grey-brown boulder |
| `rock-2.png` | 128×96 | cluster of rocks |
| `flowers.png` | 64×64 | small patch of wild flowers (pink, yellow, white) |

## D. ของในหมู่บ้าน

| ไฟล์ | ขนาดขั้นต่ำ | prompt ต่อท้าย |
|---|---|---|
| `fountain.png` | 160×180 | round stone fountain with a basin of turquoise water and a small water spout |
| `anvil.png` | 80×64 | blacksmith anvil on a tree stump |
| `cook-pot.png` | 80×80 | black cooking pot over a small campfire on stones |
| `lamp-post.png` | 48×128 | wooden village lamp post with a hanging lantern |
| `notice-board.png` | 96×112 | wooden notice board with pinned papers (no readable text) |
| `signpost.png` | 80×112 | wooden crossroads signpost with three arrow boards (blank, no text) |
| `fence-h.png` | 128×64 | short straight wooden fence section, horizontal, two posts and rails |
| `fence-v.png` | 32×128 | the same wooden fence, running vertically (seen from above) |
| `fence-post.png` | 32×64 | single wooden fence post |
| `trough.png` | 96×48 | wooden feeding trough for chickens |
| `nest.png` | 64×48 | straw nest basket |
| `barrel.png` | 48×64 | wooden barrel |
| `crates.png` | 96×80 | stacked wooden crates |
| `scarecrow.png` | 64×112 | straw scarecrow with a farmer hat |
| `jetty.png` | 160×96 | short wooden jetty / dock planks |
| `bridge-h.png` | 256×128 | wooden plank bridge crossing left to right, with rails |
| `bridge-v.png` | 128×256 | wooden plank bridge crossing top to bottom, with rails |

## ส่งมายังไง

- แนบไฟล์ในแชตได้เลย ตั้งชื่อตามตาราง (ถ้าตั้งชื่อไม่ได้ บอกในข้อความว่ารูปไหนคืออะไร)
- ไม่ต้องส่งครบทีเดียว **เริ่มจากชุดตัวอย่างนี้ก่อน** แล้วผมประกอบให้ดูว่าทางนี้ใช่ไหม:
  `ground-grass`, `ground-dirt`, `ground-plaza`, `smithy`, `inn`, `fountain`, `tree-round-1`, `tree-round-2`, `bush-1`, `lamp-post`
- ชิ้นไหนออกมาสไตล์ไม่เข้ากัน ให้สร้างใหม่โดยแนบชิ้นที่ชอบเป็นภาพอ้างอิงด้วย จะได้เข้าชุดกัน
