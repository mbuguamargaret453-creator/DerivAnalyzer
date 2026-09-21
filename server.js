import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tradingRoutes from "./server/trading-routes.js";
import authRoutes from "./server/auth-routes.js";

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT)||3000;

app.disable("x-powered-by");
app.set("trust proxy",1);
app.use(express.json({limit:"32kb"}));

app.get("/health",(req,res)=>res.status(200).json({ok:true,service:"deriv-updown-dashboard"}));
app.use("/api/auth",authRoutes);
app.use("/api/trading",tradingRoutes);

const dist=path.join(__dirname,"dist");
app.use(express.static(dist));
app.use((req,res)=>{
  if(req.path.startsWith("/api/")) return res.status(404).json({error:"API route not found"});
  res.sendFile(path.join(dist,"index.html"));
});

app.listen(port,()=>console.log(`Deriv dashboard server listening on port ${port}`));
