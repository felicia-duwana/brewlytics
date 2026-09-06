import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outDir = "outputs/brewlytics-dataset-2";
const wb = Workbook.create();
const names = ["README", "Sales", "Products", "Ingredient Costs", "Promotions", "Staffing"];
const sheets = Object.fromEntries(names.map(n => [n, wb.worksheets.add(n)]));
const green="#174F3D", lime="#DFF36A", pale="#EFF5ED", line="#DDE5DF", orange="#F4E5D2";
let seed=261102;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const round=(n,d=2)=>Number(n.toFixed(d));

const outlets=["Tiong Bahru","Tanjong Pagar","Joo Chiat"];
const products=[
 ["P001","Flat White","Coffee",6.2,1.55,"Dairy"],["P002","Iced Latte","Coffee",6.8,1.75,"Dairy"],
 ["P003","Kopi O","Coffee",3.2,.62,"Coffee"],["P004","Long Black","Coffee",4.8,.88,"Coffee"],
 ["P005","Matcha Latte","Tea",7.2,2.05,"Dairy"],["P006","Teh C","Tea",3.5,.72,"Dairy"],
 ["P007","Croissant","Bakery",4.5,1.35,"Bakery"],["P008","Kaya Toast Set","Food",6.5,2.1,"Food"]
];
const ingredients=[
 ["I001","Fresh milk","litre",2.45],["I002","Oat milk","litre",4.1],["I003","Coffee beans","kg",25.8],
 ["I004","Matcha powder","kg",52],["I005","Bread loaf","unit",3.1],["I006","Butter","kg",11.5],
 ["I007","Eggs","dozen",4.2],["I008","Croissant","unit",1.15]
];
const pad=n=>String(n).padStart(2,"0");
const dateStr=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

const sales=[["date","outlet","product_id","product_name","channel","units_sold","gross_revenue_sgd","discount_sgd","net_revenue_sgd","estimated_product_cost_sgd"]];
for(let day=0;day<91;day++){
 const dt=new Date(2026,8,1+day), ds=dateStr(dt), weekend=[0,6].includes(dt.getDay());
 for(let oi=0;oi<outlets.length;oi++) for(let pi=0;pi<products.length;pi++) for(const channel of ["In-store","Delivery"]){
  const p=products[pi]; let base=(weekend?15:11)*(1-pi*.055)*(channel==="Delivery"?.39:.61)*(1+oi*.08);
  if(dt.getMonth()===10) base*=1.06;
  let units=Math.max(2,Math.round(base*(.82+rand()*.38)));
  const promo=(ds>="2026-11-05"&&ds<="2026-11-20"&&channel==="Delivery")?.18:(channel==="Delivery"?.06:0);
  const gross=units*p[3], discount=gross*promo, dairyShock=(outlets[oi]==="Joo Chiat"&&ds>="2026-11-02"&&p[5]==="Coffee")?1.22:1;
  sales.push([ds,outlets[oi],p[0],p[1],channel,units,round(gross),round(discount),round(gross-discount),round(units*p[4]*dairyShock)]);
 }
}

const productsRows=[["product_id","product_name","category","list_price_sgd","baseline_unit_cost_sgd","primary_cost_group","active"]];
for(const p of products)productsRows.push([...p,true]);
const ingredientRows=[["week_start","outlet","ingredient_id","ingredient_name","unit","unit_cost_sgd","supplier","estimated_flag"]];
for(let w=0;w<14;w++){
 const dt=new Date(2026,8,1+w*7),ds=dateStr(dt);
 for(const outlet of outlets) for(const ing of ingredients){let cost=ing[3]*(.97+rand()*.06);if(outlet==="Joo Chiat"&&ds>="2026-11-02"&&ing[0]==="I003")cost*=1.22;ingredientRows.push([ds,outlet,ing[0],ing[1],ing[2],round(cost),ing[0]==="I003"?"Straits Roastery":"Local Foods Pte Ltd",false]);}
}
const promoRows=[["promotion_id","start_date","end_date","outlet","channel","promotion_name","discount_rate","funded_by"]];
promoRows.push(["PR101","2026-09-12","2026-09-18","All","Delivery","September delivery","10%","Cafe"],["PR102","2026-10-05","2026-10-11","All","In-store","Breakfast set","8%","Cafe"],["PR103","2026-11-05","2026-11-20","All","Delivery","11.11 delivery campaign","18%","Cafe"],["PR104","2026-11-18","2026-11-25","Tiong Bahru","In-store","Neighbourhood week","9%","Cafe"]);
const staffRows=[["date","outlet","shift","scheduled_staff","worked_hours","labour_cost_sgd","manager_on_duty"]];
for(let day=0;day<91;day++){const dt=new Date(2026,8,1+day),ds=dateStr(dt),weekend=[0,6].includes(dt.getDay());for(let oi=0;oi<outlets.length;oi++)for(const shift of ["Morning","Afternoon"]){const count=(weekend?4:3)+(oi===1?1:0),hours=count*8;staffRows.push([ds,outlets[oi],shift,count,hours,round(hours*(15.1+oi*.55)),["Aisha","Ben","Charmaine"][oi]]);}}

const readme=[
 ["Brewlytics Synthetic Café Dataset"],["Purpose","Upload-ready hackathon dataset for a 3-outlet Singapore café chain"],
 ["Period","2026-09-01 to 2026-11-30"],["Currency","Singapore dollars (SGD)"],["Privacy","Entirely synthetic; contains no real customer or employee data"],
 [""],["Expected analytical signal"],["Revenue grows in November while estimated profit softens."],
 ["Joo Chiat coffee-bean costs rise about 22% from 2 November."],["An 18% delivery promotion runs from 5–20 November, reducing contribution margin."],
 ["These are designed associations for testing and do not establish causation."],[""],["Sheet","Grain","Key fields"],
 ["Sales","Date × outlet × product × channel","units, gross revenue, discount, net revenue, product cost"],
 ["Products","One row per menu item","price, baseline cost, category"],["Ingredient Costs","Week × outlet × ingredient","supplier cost history"],
 ["Promotions","One row per campaign","dates, channel, discount rate"],["Staffing","Date × outlet × shift","staff count, hours, labour cost"]
];

sheets.README.getRange(`A1:C${readme.length}`).values=readme.map(r=>[...r,...Array(3-r.length).fill(null)]);
sheets.Sales.getRange(`A1:J${sales.length}`).values=sales;
sheets.Products.getRange(`A1:G${productsRows.length}`).values=productsRows;
sheets["Ingredient Costs"].getRange(`A1:H${ingredientRows.length}`).values=ingredientRows;
sheets.Promotions.getRange(`A1:H${promoRows.length}`).values=promoRows;
sheets.Staffing.getRange(`A1:G${staffRows.length}`).values=staffRows;

function styleData(sheet,cols,rows,tableName){sheet.showGridLines=false;sheet.freezePanes.freezeRows(1);const head=sheet.getRange(`A1:${cols}1`);head.format={fill:green,font:{bold:true,color:"#FFFFFF"},rowHeight:26};sheet.getRange(`A1:${cols}${rows}`).format.font={name:"Aptos",size:10};sheet.getRange(`A2:${cols}${rows}`).format.borders={insideHorizontal:{style:"thin",color:line}};sheet.tables.add(`A1:${cols}${rows}`,true,tableName).style="TableStyleMedium4";sheet.getUsedRange().format.autofitColumns();}
styleData(sheets.Sales,"J",sales.length,"SalesTable");styleData(sheets.Products,"G",productsRows.length,"ProductsTable");styleData(sheets["Ingredient Costs"],"H",ingredientRows.length,"IngredientCostsTable");styleData(sheets.Promotions,"H",promoRows.length,"PromotionsTable");styleData(sheets.Staffing,"G",staffRows.length,"StaffingTable");
sheets.Sales.getRange(`G2:J${sales.length}`).format.numberFormat='"S$"#,##0.00';sheets.Products.getRange(`D2:E${productsRows.length}`).format.numberFormat='"S$"#,##0.00';sheets["Ingredient Costs"].getRange(`F2:F${ingredientRows.length}`).format.numberFormat='"S$"#,##0.00';sheets.Promotions.getRange(`G2:G${promoRows.length}`).format.numberFormat="0%";sheets.Staffing.getRange(`F2:F${staffRows.length}`).format.numberFormat='"S$"#,##0.00';
for(const s of [sheets.Sales,sheets["Ingredient Costs"],sheets.Promotions,sheets.Staffing])s.getRange("A:A").format.columnWidth=13;
sheets.README.showGridLines=false;sheets.README.getRange("A1:C1").merge();sheets.README.getRange("A1").format={fill:green,font:{bold:true,color:lime,size:20},rowHeight:38};sheets.README.getRange("A7:C7").merge();sheets.README.getRange("A7").format={fill:pale,font:{bold:true,color:green}};sheets.README.getRange("A13:C13").format={fill:green,font:{bold:true,color:"#FFFFFF"}};sheets.README.getRange("A1:C18").format.font={name:"Aptos"};sheets.README.getRange("A1:C18").format.wrapText=true;sheets.README.getRange("A1:C18").format.autofitRows();sheets.README.getRange("A:A").format.columnWidth=22;sheets.README.getRange("B:B").format.columnWidth=54;sheets.README.getRange("C:C").format.columnWidth=54;sheets.README.getRange("A8:C11").format.fill=orange;

await fs.mkdir(outDir,{recursive:true});
for(const [name,sheet] of Object.entries(sheets)){const max=name==="README"?18:Math.min(24,sheet.getUsedRange().rowCount);const blob=await wb.render({sheetName:name,range:`A1:${name==="Sales"?"J":name==="Ingredient Costs"||name==="Promotions"?"H":name==="Products"||name==="Staffing"?"G":"C"}${max}`,scale:1,format:"png"});await fs.writeFile(`${outDir}/preview-${name.replaceAll(" ","-")}.png`,new Uint8Array(await blob.arrayBuffer()));}
console.log((await wb.inspect({kind:"table",range:"README!A1:C18",include:"values,formulas",tableMaxRows:20,tableMaxCols:5})).ndjson);
console.log((await wb.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:100},summary:"formula error scan"})).ndjson);
const output=await SpreadsheetFile.exportXlsx(wb);await output.save(`${outDir}/Brewlytics_Cafe_Dataset_2.xlsx`);
console.log(JSON.stringify({salesRows:sales.length-1,ingredientRows:ingredientRows.length-1,staffRows:staffRows.length-1,path:`${outDir}/Brewlytics_Cafe_Dataset_2.xlsx`}));
