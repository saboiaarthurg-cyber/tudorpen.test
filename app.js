import * as THREE from './vendor/three.module.js';

const canvas = document.querySelector('#product-canvas');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f1efea');
const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
scene.add(new THREE.HemisphereLight('#fffaf0','#696b6c',2.0));
const keyLight = new THREE.DirectionalLight('#fff4db',4.2);keyLight.position.set(-4,7,8);scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#d4e0e2',2.3);fillLight.position.set(5,2,-5);scene.add(fillLight);
const rimLight = new THREE.DirectionalLight('#fff0d0',2.6);rimLight.position.set(2,5,3);scene.add(rimLight);

const penRoot=new THREE.Group(),caseRoot=new THREE.Group();penRoot.visible=true;caseRoot.visible=false;scene.add(penRoot,caseRoot);
let penBodyMesh=null,penInsideAssembly=null;
let activeModel='pen',openPen=false,focusName='whole',language='en',dragging=false,lastPointer={x:0,y:0},pointerOrigin=null;
let caseScreenTexture=null,caseScreenCanvas=null;
let theta=.30,phi=.18,distance=13,targetDistance=13,currentTarget=new THREE.Vector3(0,0,0),desiredTarget=new THREE.Vector3(0,0,0);
let renderWidth=0,renderHeight=0;
const finish={
  lacquer:new THREE.MeshPhysicalMaterial({color:'#3b4345',metalness:.32,roughness:.24,clearcoat:.9,clearcoatRoughness:.12}),
  blackMetal:new THREE.MeshStandardMaterial({color:'#242727',metalness:.82,roughness:.22}),
  gold:new THREE.MeshStandardMaterial({color:'#b99a60',metalness:.86,roughness:.22}),
  nib:new THREE.MeshPhysicalMaterial({color:'#c9aa6c',metalness:.86,roughness:.23,clearcoat:.6}),
  dark:new THREE.MeshStandardMaterial({color:'#101314',metalness:.22,roughness:.38}),
  glass:new THREE.MeshPhysicalMaterial({color:'#09242a',metalness:.48,roughness:.12,clearcoat:1,clearcoatRoughness:.05}),
  board:new THREE.MeshStandardMaterial({color:'#17685a',metalness:.22,roughness:.42}),
  copper:new THREE.MeshStandardMaterial({color:'#c28758',metalness:.84,roughness:.28}),
  steel:new THREE.MeshStandardMaterial({color:'#aaa79f',metalness:.8,roughness:.26}),
  foam:new THREE.MeshStandardMaterial({color:'#3b3d39',metalness:.02,roughness:.9}),
  shell:new THREE.MeshPhysicalMaterial({color:'#cbc8c0',metalness:.4,roughness:.32,clearcoat:.35}),
  screen:new THREE.MeshPhysicalMaterial({color:'#12191a',metalness:.2,roughness:.17,clearcoat:1})
};
function addMesh(group,geometry,material,position=[0,0,0],rotation=[0,0,0],name='part'){
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function cylinder(group,rTop,rBottom,h,material,position,segments=64,name='cylinder'){
  return addMesh(group,new THREE.CylinderGeometry(rTop,rBottom,h,segments,1,false),material,position,[0,0,0],name);
}
function torus(group,r,t,material,position,rotation=[Math.PI/2,0,0],name='ring'){
  return addMesh(group,new THREE.TorusGeometry(r,t,12,80),material,position,rotation,name);
}
function buildWritingTip(group){
  // A familiar ballpoint nose: tapered metal cone, short collar and a tiny writing ball.
  const cone=cylinder(group,.235,.035,.66,finish.steel,[0,-2.88,0],72,'tapered ballpoint nose');
  torus(group,.245,.018,finish.gold,[0,-2.52,0],[Math.PI/2,0,0],'nose collar ring');
  addMesh(group,new THREE.SphereGeometry(.031,24,18),finish.blackMetal,[0,-3.223,0],[0,0,0],'ballpoint writing tip');
}
function buildButton(group,y,symbol){
  // Recess and bezel are solid concentric components; the dark actuator sits flush in the pen wall.
  const socket=cylinder(group,.112,.112,.020,finish.blackMetal,[0,y,.286],48,`${symbol} recessed socket`);socket.rotation.x=Math.PI/2;
  torus(group,.088,.008,finish.steel,[0,y,.293],[0,0,0],`${symbol} bezel`);
  const actuator=cylinder(group,.074,.074,.018,finish.dark,[0,y,.287],48,`${symbol} inset button`);actuator.rotation.x=Math.PI/2;
  if(symbol==='camera'){
    const iconZ=.300;
    for(const [x,dy,w,h] of [[0,.015,.052,.006],[0,-.015,.052,.006],[-.023,0,.006,.030],[.023,0,.006,.030]])addMesh(group,new THREE.BoxGeometry(w,h,.006),finish.steel,[x,y+dy,iconZ],[0,0,0],'camera icon frame');
    torus(group,.010,.004,finish.steel,[0,y,.306],[0,0,0],'camera icon lens rim');
    const lens=cylinder(group,.006,.006,.004,finish.glass,[0,y,.307],24,'camera icon lens');lens.rotation.x=Math.PI/2;
  } else if(symbol==='microphone'){
    const mic=addMesh(group,new THREE.CapsuleGeometry(.014,.026,6,12),finish.steel,[0,y+.004,.302],[0,0,0],'microphone icon capsule');mic.scale.z=.16;
    const stem=addMesh(group,new THREE.BoxGeometry(.006,.018,.006),finish.steel,[0,y-.021,.303],[0,0,0],'microphone icon stem');
    const foot=addMesh(group,new THREE.BoxGeometry(.030,.006,.006),finish.steel,[0,y-.031,.303],[0,0,0],'microphone icon foot');
  } else {
    for(const x of [-.025,0,.025])addMesh(group,new THREE.SphereGeometry(.006,12,10),finish.gold,[x,y+.012,.303],[0,0,0],'Morse icon dot');
    addMesh(group,new THREE.BoxGeometry(.038,.008,.006),finish.gold,[0,y-.014,.303],[0,0,0],'Morse icon dash');
  }
}
function buildPen(){
  penRoot.clear();
  const profile=[new THREE.Vector2(0,-2.53),new THREE.Vector2(.215,-2.53),new THREE.Vector2(.235,-2.50),new THREE.Vector2(.27,-2.39),new THREE.Vector2(.29,-2.28),new THREE.Vector2(.30,-2.18),new THREE.Vector2(.30,1.23),new THREE.Vector2(.33,1.28),new THREE.Vector2(.34,1.37),new THREE.Vector2(.32,1.43),new THREE.Vector2(.32,3.03),new THREE.Vector2(.30,3.15),new THREE.Vector2(.225,3.28),new THREE.Vector2(.225,3.34),new THREE.Vector2(0,3.34)];
  const body=addMesh(penRoot,new THREE.LatheGeometry(profile,96),finish.lacquer,[0,0,0],[0,0,0],'solid one-piece lacquer body');
  cylinder(penRoot,.306,.306,.055,finish.gold,[0,-2.26,0],96,'grip trim ring');
  for(const y of [-2.08,-1.98,-1.88])torus(penRoot,.302,.006,finish.blackMetal,[0,y,0],[Math.PI/2,0,0],'fine grip groove');
  cylinder(penRoot,.338,.338,.075,finish.gold,[0,1.34,0],96,'cap band');
  cylinder(penRoot,.327,.327,.035,finish.blackMetal,[0,1.43,0],96,'cap band shadow line');
  cylinder(penRoot,.323,.323,.045,finish.gold,[0,3.02,0],96,'crown ring');
  cylinder(penRoot,.319,.319,.025,finish.blackMetal,[0,3.06,0],96,'crown ring inset');
  // Three low-profile side controls are recessed into the barrel, in the same physical coordinate space.
  buildButton(penRoot,.62,'camera');buildButton(penRoot,.22,'microphone');buildButton(penRoot,-.18,'morse');
  for(const y of [-1.0,-1.45]){
    const pad=cylinder(penRoot,.072,.072,.018,finish.gold,[0,y,.298],36,'magnetic charging contact');pad.rotation.x=Math.PI/2;
    torus(penRoot,.089,.010,finish.steel,[0,y,.309],[0,0,0],'magnetic contact bezel');
  }
  // Solid metal pocket clip attached to the cap and arched back toward the cap band.
  const clipCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.11,2.88,.29),new THREE.Vector3(.16,2.76,.38),new THREE.Vector3(.18,2.26,.39),new THREE.Vector3(.17,1.78,.38),new THREE.Vector3(.12,1.59,.31)]);
  addMesh(penRoot,new THREE.TubeGeometry(clipCurve,72,.034,10,false),finish.gold,[0,0,0],[0,0,0],'solid gold pocket clip');
  cylinder(penRoot,.075,.075,.10,finish.gold,[.1,2.92,.28],32,'clip hinge');
  buildWritingTip(penRoot);
  // The three top sensors sit directly in the pen's flush end face; there is no extra cap or raised plate.
  const topRing=torus(penRoot,.067,.006,finish.steel,[0,3.342,0],[-Math.PI/2,0,0],'flush camera lens rim');
  cylinder(penRoot,.058,.058,.008,finish.glass,[0,3.341,0],48,'flush top camera lens');
  addMesh(penRoot,new THREE.SphereGeometry(.010,16,12),new THREE.MeshBasicMaterial({color:'#9fc7c8'}),[-.018,3.346,.018],[0,0,0],'camera lens glint');
  cylinder(penRoot,.025,.025,.008,new THREE.MeshStandardMaterial({color:'#79271e',emissive:'#3d0d08',emissiveIntensity:.25}),[-.145,3.341,0],32,'flush laser aperture');
  const micOutline=addMesh(penRoot,new THREE.CapsuleGeometry(.025,.085,6,18),finish.steel,[.145,3.342,0],[Math.PI/2,0,0],'flush microphone outline');micOutline.scale.z=.12;
  for(const z of [-.042,-.014,.014,.042])cylinder(penRoot,.008,.008,.006,finish.dark,[.145,3.347,z],20,'flush microphone grille port');
  // A true exploded assembly: the cap, barrel halves and writing nose pull apart along the pen's axis.
  const inside=new THREE.Group();inside.name='internal assembly';penRoot.add(inside);inside.visible=false;
  addMesh(inside,new THREE.CylinderGeometry(.30,.30,3.12,64,1,true,Math.PI,Math.PI),finish.lacquer,[-.46,-.38,0],[0,0,0],'left half of opened barrel');
  addMesh(inside,new THREE.CylinderGeometry(.30,.30,3.12,64,1,true,0,Math.PI),finish.lacquer,[.46,-.38,0],[0,0,0],'right half of opened barrel');
  for(const [y,label] of [[.62,'camera'],[.22,'microphone'],[-.18,'morse']])buildButton(inside,y,label);
  cylinder(inside,.115,.115,.82,finish.steel,[.10,-.88,.01],48,'rechargeable lithium battery');
  cylinder(inside,.12,.12,.04,finish.gold,[.10,-.44,.01],40,'battery terminal');
  addMesh(inside,new THREE.BoxGeometry(.20,.86,.055),finish.board,[-.10,.14,.02],[0,0,0],'main circuit board');
  addMesh(inside,new THREE.BoxGeometry(.15,.15,.075),finish.blackMetal,[-.10,.38,.09],[0,0,0],'main processor');
  addMesh(inside,new THREE.BoxGeometry(.13,.12,.065),finish.copper,[.04,-.04,.08],[0,0,0],'wireless communication module');
  addMesh(inside,new THREE.BoxGeometry(.10,.12,.055),finish.gold,[-.10,-.29,.08],[0,0,0],'memory chip');
  for(let i=0;i<5;i++)addMesh(inside,new THREE.BoxGeometry(.13,.014,.008),finish.gold,[-.10,-.20+i*.15,.06],[0,0,0],'circuit board trace');
  const flex=new THREE.CatmullRomCurve3([new THREE.Vector3(-.10,.55,.05),new THREE.Vector3(-.02,.72,.04),new THREE.Vector3(.06,.88,.04),new THREE.Vector3(.02,1.04,.04)]);
  addMesh(inside,new THREE.TubeGeometry(flex,28,.018,8,false),finish.copper,[0,0,0],[0,0,0],'camera sensor flex cable');
  cylinder(inside,.075,.075,.16,finish.blackMetal,[0,1.05,.02],40,'camera sensor module');
  cylinder(inside,.045,.045,.07,finish.glass,[0,1.17,.02],36,'camera optic');
  cylinder(inside,.031,.031,.11,finish.copper,[-.15,1.03,0],28,'laser diode');
  addMesh(inside,new THREE.CapsuleGeometry(.040,.13,8,20),finish.blackMetal,[.15,1.00,.02],[0,0,0],'microphone capsule');
  cylinder(inside,.008,.008,.012,finish.steel,[.15,1.12,.05],16,'microphone port');
  cylinder(inside,.057,.057,1.02,finish.steel,[0,-1.70,0],48,'ballpoint ink refill tube');
  cylinder(inside,.018,.018,.88,new THREE.MeshStandardMaterial({color:'#475b68',metalness:.18,roughness:.42}),[0,-1.70,.04],32,'ink reservoir');
  cylinder(inside,.045,.045,.04,finish.gold,[0,-1.20,0],32,'refill spring');
  addMesh(inside,new THREE.CylinderGeometry(.32,.32,1.68,72,1,true),finish.lacquer,[0,2.98,0],[0,0,0],'separated cap shell');
  cylinder(inside,.338,.338,.065,finish.gold,[0,2.12,0],72,'separated cap band');
  const capClip=new THREE.CatmullRomCurve3([new THREE.Vector3(.11,3.76,.29),new THREE.Vector3(.16,3.58,.38),new THREE.Vector3(.18,3.08,.39),new THREE.Vector3(.17,2.58,.38),new THREE.Vector3(.12,2.34,.31)]);
  addMesh(inside,new THREE.TubeGeometry(capClip,52,.03,8,false),finish.gold,[0,0,0],[0,0,0],'separated pocket clip');
  cylinder(inside,.21,.21,.025,finish.blackMetal,[0,3.84,0],56,'cap sensor plate');
  torus(inside,.062,.005,finish.steel,[0,3.86,0],[-Math.PI/2,0,0],'cap camera ring');
  cylinder(inside,.054,.054,.008,finish.glass,[0,3.86,0],40,'cap camera lens');
  cylinder(inside,.023,.023,.008,finish.gold,[-.145,3.86,0],24,'cap laser opening');
  for(const z of [-.03,-.01,.01,.03])cylinder(inside,.007,.007,.006,finish.dark,[.145,3.86,z],16,'cap microphone grille');
  for(const y of [-1.0,-1.45]){
    const dockContact=cylinder(inside,.072,.072,.018,finish.gold,[.30,y,.298],36,'magnetic charging contact');dockContact.rotation.x=Math.PI/2;
    torus(inside,.089,.010,finish.steel,[.30,y,.309],[0,0,0],'magnetic contact bezel');
  }
  cylinder(inside,.245,.245,.38,finish.blackMetal,[0,-2.47,0],64,'detached grip and nose collar');
  addMesh(inside,new THREE.CylinderGeometry(.235,.035,.66,72),finish.steel,[0,-3.03,0],[0,0,0],'detached tapered writing nose');
  addMesh(inside,new THREE.SphereGeometry(.031,24,18),finish.blackMetal,[0,-3.37,0],[0,0,0],'writing ball');
  inside.userData.openParts=true;
  penBodyMesh=body;penInsideAssembly=inside;penRoot.scale.set(1.08,1,1.08);
  setOpen(false);
}
function roundedPlate(width,depth,radius,thickness,material,group,position,rotation=[0,0,0],name='case shell'){
  const x=width/2,z=depth/2,s=new THREE.Shape();s.moveTo(-x+radius,-z);s.lineTo(x-radius,-z);s.quadraticCurveTo(x,-z,x,-z+radius);s.lineTo(x,z-radius);s.quadraticCurveTo(x,z,x-radius,z);s.lineTo(-x+radius,z);s.quadraticCurveTo(-x,z,-x,z-radius);s.lineTo(-x,-z+radius);s.quadraticCurveTo(-x,-z,-x+radius,-z);
  const geo=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.07,bevelThickness:.055,curveSegments:10});geo.rotateX(-Math.PI/2);
  return addMesh(group,geo,material,position,rotation,name);
}
function drawCaseScreen(){
  if(!caseScreenCanvas)return;const c=caseScreenCanvas.getContext('2d'),pt=language==='pt';
  const W=caseScreenCanvas.width,H=caseScreenCanvas.height;c.clearRect(0,0,W,H);c.fillStyle='#171b1b';c.fillRect(0,0,W,H);
  c.fillStyle='#c7b48d';c.font='600 34px Arial';c.letterSpacing='4px';c.fillText('TUDOR',510,44);
  c.fillStyle='#aaa99f';c.font='29px Arial';c.letterSpacing='0';c.fillText('09:41',900,44);
  c.fillStyle='#f2f0e9';c.font='52px Georgia';c.fillText(pt?'Sua biblioteca':'Your library',510,112);
  const rows=pt?[['◉','Caminhada da manhã','VÍDEO · 00:32'],['↔','Notas de viagem','TRADUÇÃO · 02:14'],['···','Mensagem rápida','MORSE · 00:08']]:[['◉','Morning walk','VIDEO · 00:32'],['↔','Travel notes','TRANSLATION · 02:14'],['···','Quick message','MORSE · 00:08']];
  rows.forEach((row,i)=>{const y=137+i*99;c.strokeStyle='#454a47';c.lineWidth=2;c.beginPath();c.moveTo(38,y);c.lineTo(W-38,y);c.stroke();c.fillStyle='#c4ad7e';c.font='36px Arial';c.fillText(row[0],520,y+57);c.fillStyle='#efede7';c.font='38px Arial';c.fillText(row[1],580,y+42);c.fillStyle='#a5a69f';c.font='23px Arial';c.letterSpacing='1px';c.fillText(row[2],580,y+75);c.letterSpacing='0';c.fillStyle='#999b95';c.font='40px Arial';c.fillText('›',960,y+57);});
  c.fillStyle='#8d8e86';c.beginPath();c.roundRect(W/2-45,H-18,90,5,3);c.fill();
}
function buildCase(){
  caseRoot.clear();
  roundedPlate(8.2,2.55,.28,.48,finish.shell,caseRoot,[0,-1.22,0],[0,0,0],'lower half of rectangular charging case');
  // Raised inner walls make the lower half a real tray and leave the docked pen below the lid.
  addMesh(caseRoot,new THREE.BoxGeometry(8.2,.70,.14),finish.shell,[0,-.39,1.205],[0,0,0],'front wall of lower case');
  addMesh(caseRoot,new THREE.BoxGeometry(8.2,.70,.14),finish.shell,[0,-.39,-1.205],[0,0,0],'rear wall of lower case');
  addMesh(caseRoot,new THREE.BoxGeometry(.14,.70,2.55),finish.shell,[4.02,-.39,0],[0,0,0],'right wall of lower case');
  addMesh(caseRoot,new THREE.BoxGeometry(.14,.70,2.55),finish.shell,[-4.02,-.39,0],[0,0,0],'left wall of lower case');
  roundedPlate(7.92,2.26,.22,.10,finish.foam,caseRoot,[0,-.82,0],[0,0,0],'molded fitted cushion');
  const channel=new THREE.Mesh(new THREE.CapsuleGeometry(.18,7.10,8,32),finish.dark);channel.rotation.z=Math.PI/2;channel.position.set(0,-.70,.05);channel.name='pen-shaped fitted groove';caseRoot.add(channel);
  const dockPen=penRoot.clone(true);dockPen.name='same fully detailed pen docked in case';dockPen.position.set(0,-.42,.05);dockPen.rotation.z=Math.PI/2;dockPen.visible=true;caseRoot.add(dockPen);
  for(const x of [1.0,1.45]){
    const contact=cylinder(caseRoot,.075,.075,.060,finish.gold,[x,-.42,.355],40,'magnetic contact matching pen connector');contact.rotation.x=Math.PI/2;
    torus(caseRoot,.095,.010,finish.steel,[x,-.42,.390],[0,0,0],'charging contact rim');
  }
  // The upper shell rotates around the center hinge and carries its screen on the inner face.
  const lid=new THREE.Group();lid.name='hinged upper case half';caseRoot.add(lid);lid.position.set(0,1.20,-1.08);lid.rotation.x=Math.PI/2;
  roundedPlate(8.12,2.48,.27,.70,finish.shell,lid,[0,0,0],[0,0,0],'upper hinged half of case with screen housing');
  roundedPlate(7.62,2.08,.16,.045,finish.screen,lid,[0,.76,0],[0,0,0],'touchscreen glass inset flush into lid');
  caseScreenCanvas=document.createElement('canvas');caseScreenCanvas.width=1440;caseScreenCanvas.height=450;drawCaseScreen();
  caseScreenTexture=new THREE.CanvasTexture(caseScreenCanvas);caseScreenTexture.colorSpace=THREE.SRGBColorSpace;
  const screenMaterial=new THREE.MeshBasicMaterial({map:caseScreenTexture,side:THREE.DoubleSide,toneMapped:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const screenFace=addMesh(lid,new THREE.PlaneGeometry(7.42,1.98),screenMaterial,[0,.87,0],[-Math.PI/2,0,0],'touchscreen interface image inset in lid');screenFace.renderOrder=2;
  const hinge=cylinder(caseRoot,.075,.075,3.2,finish.steel,[0,-.69,-1.02],48,'continuous center hinge');hinge.rotation.z=Math.PI/2;
  for(const x of [-1.48,1.48]){
    const pin=cylinder(caseRoot,.09,.09,.12,finish.gold,[x,-.69,-1.02],32,'hinge pin');pin.rotation.z=Math.PI/2;
    const armCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,-.69,-1.02),new THREE.Vector3(x,-.43,-.91),new THREE.Vector3(x,-.20,-.82)]);
    addMesh(caseRoot,new THREE.TubeGeometry(armCurve,20,.032,8,false),finish.steel,[0,0,0],[0,0,0],'hinge support arm');
  }
  const makeSlot=(w,h,material,name,x)=>{const s=new THREE.Shape();const r=h/2;s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new THREE.ExtrudeGeometry(s,{depth:.025,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.008,bevelThickness:.006});g.rotateY(Math.PI/2);return addMesh(caseRoot,g,material,[x,-.49,.05],[0,0,0],name);};
  makeSlot(.34,.19,finish.steel,'USB-C port metal rim',4.08);
  makeSlot(.27,.12,finish.dark,'USB-C opening on outside case wall',4.107);
  makeSlot(.17,.045,finish.blackMetal,'USB-C tongue and inner socket',4.132);
}
function setOpen(value){openPen=value;if(penBodyMesh)penBodyMesh.visible=!value;if(penInsideAssembly)penInsideAssembly.visible=value;penRoot.children.forEach(child=>{if(child.userData.openParts)return;const removeForOpen=/(solid one-piece lacquer body|recessed socket|bezel|inset button|icon|actuator|pocket clip|clip hinge|cap band|crown ring|grip trim ring|grip groove|flush|microphone grille|laser aperture|camera lens|tapered ballpoint|nose collar|ballpoint writing tip|nose machining)/i.test(child.name);child.visible=!(value&&removeForOpen);});}
function render(){requestAnimationFrame(render);const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;if(rect.width!==renderWidth||rect.height!==renderHeight){renderWidth=rect.width;renderHeight=rect.height;renderer.setSize(renderWidth,renderHeight,false);camera.aspect=renderWidth/renderHeight;camera.updateProjectionMatrix();}currentTarget.lerp(desiredTarget,.11);distance+=(targetDistance-distance)*.12;const cp=Math.cos(phi);camera.position.set(currentTarget.x+distance*Math.sin(theta)*cp,currentTarget.y+distance*Math.sin(phi),currentTarget.z+distance*Math.cos(theta)*cp);camera.lookAt(currentTarget);renderer.render(scene,camera);}
const viewerCopy={
  en:{whole:'A solid, polished communication pen. Drag to inspect every side.',cameraButton:'A real camera symbol is recessed into the camera control.',microphoneButton:'The microphone control has a recognizable capsule-and-stand symbol.',morseButton:'The Morse control is marked with three dots and a dash.',nib:'A familiar tapered ballpoint tip, finished in polished metal.',sensors:'Camera lens, microphone grille and laser aperture sit flush in the pen end.',inside:'Exploded view: cap, barrel shells, writing nose and electronic parts separate along the pen body.',caseWhole:'A rectangular clamshell case with a center hinge, a fitted pen cradle and an active touch display in the lid.',caseScreen:'The touch display is built into the inner face of the upper case half.',caseCradle:'The same pen rests in its molded cushion above two magnetic charging contacts.',caseUsbc:'The USB-C charging socket is built into the outside wall of the case.'},
  pt:{whole:'Caneta de comunicação sólida, com acabamento polido. Arraste para ver todos os lados.',cameraButton:'O símbolo de câmera está embutido no botão da câmera.',microphoneButton:'O botão do microfone traz o desenho reconhecível de um microfone.',morseButton:'O botão Morse é marcado com pontos e traço.',nib:'Ponta esferográfica cônica, com acabamento metálico.',sensors:'Lente da câmera, microfone e laser ficam embutidos na extremidade da caneta.',inside:'Vista explodida: tampa, corpo, ponta e componentes eletrônicos se separam ao longo da caneta.',caseWhole:'Estojo retangular de duas metades com dobradiça central, encaixe para a caneta e tela touch na tampa.',caseScreen:'A tela touch fica embutida no lado interno da metade superior do estojo.',caseCradle:'A mesma caneta fica encaixada na almofada moldada, acima de dois contatos magnéticos.',caseUsbc:'A entrada USB-C para carregar fica na parede externa do estojo.'}
};
const viewerLabels={en:{whole:'TUDOR PEN — SIGNATURE BLACK',cameraButton:'CAMERA BUTTON',microphoneButton:'MICROPHONE BUTTON',morseButton:'MORSE BUTTON',nib:'BALLPOINT WRITING TIP',sensors:'FLUSH TOP SENSORS',inside:'DISASSEMBLED PEN',caseWhole:'TUDOR CASE — OPEN HALVES',caseScreen:'TOUCH DISPLAY',caseCradle:'FITTED PEN CRADLE',caseUsbc:'USB-C CHARGING PORT'},pt:{whole:'TUDOR PEN — PRETO CLÁSSICO',cameraButton:'BOTÃO DA CÂMERA',microphoneButton:'BOTÃO DO MICROFONE',morseButton:'BOTÃO MORSE',nib:'PONTA ESFEROGRÁFICA',sensors:'SENSORES EMBUTIDOS',inside:'CANETA DESMONTADA',caseWhole:'ESTOJO TUDOR — ABERTO',caseScreen:'TELA TOUCH',caseCradle:'ENCAIXE DA CANETA',caseUsbc:'ENTRADA USB-C'}};
function setActiveInspector(key,caseMode=false){document.querySelectorAll(caseMode?'.case-inspection .inspect-button':'.pen-inspection .inspect-button').forEach(b=>b.classList.toggle('active',(caseMode?b.dataset.caseFocus:b.dataset.focus)===key));}
function setViewerText(label,copy){document.querySelector('#model-label').textContent=viewerLabels[language][label];document.querySelector('#viewer-caption').textContent=viewerCopy[language][copy];}
function viewerKey(name){return {'camera-button':'cameraButton','microphone-button':'microphoneButton','morse-button':'morseButton'}[name]||name;}
function focusView(name){
  focusName=name;setOpen(name==='inside');
  const poses={whole:{target:[0,0,0],distance:13,phi:.18},'camera-button':{target:[0,.62,.20],distance:2.55,phi:.08},'microphone-button':{target:[0,.22,.20],distance:2.55,phi:.08},'morse-button':{target:[0,-.18,.20],distance:2.55,phi:.08},nib:{target:[0,-2.88,.04],distance:2.75,phi:-.08},sensors:{target:[0,3.32,0],distance:2.55,phi:1.02},inside:{target:[0,.15,0],distance:13,phi:.12}};
  const pose=poses[name];desiredTarget.set(...pose.target);targetDistance=pose.distance;phi=pose.phi;theta=name==='sensors' ? 0.05 : 0.30;const key=viewerKey(name);setViewerText(key,key);document.querySelector('#zoom-level').textContent=`${Math.round(13/pose.distance*100)}%`;
}
function focusCase(name){
  const poses={'case-whole':{target:[0,.40,-.15],distance:13.8,theta:.22,phi:.32,copy:'caseWhole'},'case-screen':{target:[0,1.20,-.21],distance:9.2,theta:.08,phi:.38,copy:'caseScreen'},'case-cradle':{target:[1.22,-.42,.37],distance:5.5,theta:.18,phi:.86,copy:'caseCradle'},'case-usbc':{target:[4.13,-.39,.05],distance:3.2,theta:1.20,phi:.08,copy:'caseUsbc'}};
  const pose=poses[name];if(!pose)return;focusName=name;desiredTarget.set(...pose.target);targetDistance=pose.distance;theta=pose.theta;phi=pose.phi;const label={'case-whole':'caseWhole','case-screen':'caseScreen','case-cradle':'caseCradle','case-usbc':'caseUsbc'}[name];setViewerText(label,pose.copy);document.querySelector('#zoom-level').textContent=`${Math.round(13.8/pose.distance*100)}%`;setActiveInspector(name,true);
}
function switchModel(model){
  activeModel=model;const isPen=model==='pen';penRoot.visible=isPen;scene.remove(caseRoot);caseRoot.visible=!isPen;if(!isPen)scene.add(caseRoot);
  document.querySelector('.pen-inspection').hidden=!isPen;document.querySelector('.case-inspection').hidden=isPen;
  document.querySelectorAll('.view-toggle').forEach(button=>button.classList.toggle('active',button.dataset.model===model));
  focusName=isPen?'whole':'case-whole';setOpen(false);desiredTarget.set(0,isPen?0:.05, isPen?0:-.15);targetDistance=isPen?13:13.8;distance=targetDistance;theta=isPen ? .30 : .22;phi=isPen ? .18 : .32;
  setViewerText(isPen?'whole':'caseWhole',isPen?'whole':'caseWhole');setActiveInspector(isPen?'whole':'case-whole',!isPen);document.querySelector('#zoom-level').textContent='100%';
}
const pageCopy={
en:{navDesign:'Design',navFeatures:'Features',navCase:'The case',explore:'Explore <span>↗</span>',viewerIndex:'01 / THE INSTRUMENT',dragHint:'↔ &nbsp; DRAG TO ROTATE · SCROLL TO ZOOM',inspect:'INSPECT',fullView:'Full view',cameraButton:'Camera button',micButton:'Microphone button',morseButton:'Morse button',writingTip:'Writing tip',topSensors:'Top sensors',disassemble:'Disassemble pen',inspectCase:'CASE INSPECT',fullCase:'Full case',touchDisplay:'Touch display',penCradle:'Pen cradle & contacts',usbC:'USB-C port',thePen:'The pen',chargingCase:'Charging case',heroEyebrow:'A communication tool, reimagined',heroTitle:'Ideas take<br><em>many forms.</em>',heroIntro:'A timeless writing instrument with a whole new way to connect, capture and understand the world around you.',meetPen:'Meet TUDOR PEN',heroNote:'DESIGNED TO WRITE. MADE TO CONNECT.',bandEyebrow:'A familiar feeling. A new point of view.',bandText:'Made for the moments<br>that need <em>a little more.</em>',featureEyebrow:'More than meets the hand',featureTitle:'One pen.<br><em>Many possibilities.</em>',featureAside:'Three discreet controls bring powerful tools within reach. Select a feature to explore.',cardSee:'01 — SEE',cameraTitle:'See it. Save it.',cameraBody:'Tap the camera button to record video. Press and hold, and TUDOR PEN describes what it sees aloud.',tryCamera:'Try camera',ready:'READY',cardUnderstand:'02 — UNDERSTAND',translateTitle:'Conversation, understood.',translateBody:'Tap to record audio. Press and hold to detect spoken languages automatically and translate the conversation.',tryTranslator:'Try translator',cardExpress:'03 — EXPRESS',morseMode:'MORSE MODE',morseTitle:'A message in every mark.',morseBody:'Enter Morse code, one word at a time. When a word is complete, the pen speaks it aloud.',typeWord:'TYPE A WORD',caseEyebrow:'04 — CHARGE & KEEP',caseTitle:'A little case.<br><em>A lot inside.</em>',caseBody:'The compact square case keeps your pen charged and your moments close. Magnetic contacts connect the pen as it docks. USB-C powers the case.',contactLine:'Two magnetic charging contacts',usbLine:'USB-C charging on the outside',screenLine:'Touchscreen inside the lid',caseFootnote:'The screen wakes only when TUDOR PEN is docked. Review saved recordings, translations and notes right from the case.',library:'Your library',morningWalk:'Morning walk',travelNotes:'Travel notes',quickMessage:'Quick message',caseUsb:'USB-C · CASE CHARGING',closingEyebrow:'A new chapter in communication',closingTitle:'Write your<br><em>own story.</em>',backTop:'Back to the beginning <span>↑</span>',studentProject:'A student concept project',footerNote:"DESIGNED FOR WHAT'S NEXT · 2026",speakMorse:'Speak Morse code word',morseInput:'Type a word to translate into Morse code',reset:'Reset view',language:'Switch language to Portuguese',sceneDescribed:'SCENE DESCRIBED',translationReady:'TRANSLATION READY',demoComplete:'Demo complete',cameraDemo:'Try camera',translateDemo:'Try translator',buyNow:'Buy TUDOR PEN — just for fun',buyEyebrow:'A SCHOOL PROJECT',buyTitle:'Thanks for your interest.',buyMessage:'TUDOR PEN is a student concept, so this playful button does not place a real order.',buyClose:'Back to exploring'},
pt:{navDesign:'Design',navFeatures:'Recursos',navCase:'O estojo',explore:'Explorar <span>↗</span>',viewerIndex:'01 / O INSTRUMENTO',dragHint:'↔ &nbsp; ARRASTE PARA GIRAR · ROLE PARA ZOOM',inspect:'INSPECIONAR',fullView:'Visão completa',cameraButton:'Botão da câmera',micButton:'Botão do microfone',morseButton:'Botão Morse',writingTip:'Ponta esferográfica',topSensors:'Sensores superiores',disassemble:'Desmontar a caneta',inspectCase:'INSPECIONAR ESTOJO',fullCase:'Estojo completo',touchDisplay:'Tela touch',penCradle:'Encaixe e contatos',usbC:'Entrada USB-C',thePen:'A caneta',chargingCase:'Estojo de carga',heroEyebrow:'Uma nova forma de se comunicar',heroTitle:'Ideias ganham<br><em>novas formas.</em>',heroIntro:'Um instrumento de escrita atemporal com novas formas de se conectar, registrar e compreender o mundo.',meetPen:'Conheça a TUDOR PEN',heroNote:'FEITA PARA ESCREVER. PRONTA PARA CONECTAR.',bandEyebrow:'Uma sensação familiar. Um novo olhar.',bandText:'Feita para os momentos<br>que pedem <em>algo a mais.</em>',featureEyebrow:'Muito além da escrita',featureTitle:'Uma caneta.<br><em>Muitas possibilidades.</em>',featureAside:'Três controles discretos deixam ferramentas poderosas sempre à mão. Escolha uma função para conhecer.',cardSee:'01 — VER',cameraTitle:'Veja. Registre.',cameraBody:'Toque no botão da câmera para gravar um vídeo. Mantenha pressionado para a TUDOR PEN descrever em voz alta o que está vendo.',tryCamera:'Testar câmera',ready:'PRONTA',cardUnderstand:'02 — ENTENDER',translateTitle:'Conversa sem fronteiras.',translateBody:'Toque para gravar áudio. Mantenha pressionado para detectar automaticamente os idiomas falados e traduzir a conversa.',tryTranslator:'Testar tradução',cardExpress:'03 — EXPRESSAR',morseMode:'MODO MORSE',morseTitle:'Uma mensagem em cada sinal.',morseBody:'Digite em código Morse, uma palavra por vez. Ao terminar cada palavra, a caneta a pronuncia em voz alta.',typeWord:'DIGITE UMA PALAVRA',caseEyebrow:'04 — CARREGAR E GUARDAR',caseTitle:'Um estojo compacto.<br><em>Muito por dentro.</em>',caseBody:'O estojo retangular mantém sua caneta carregada e seus registros por perto. Contatos magnéticos conectam a caneta ao encaixá-la. O USB-C carrega o estojo.',contactLine:'Dois contatos magnéticos de carga',usbLine:'Entrada USB-C na parte externa',screenLine:'Tela touch no lado interno da tampa',caseFootnote:'A tela acende somente quando a TUDOR PEN está encaixada. Reveja gravações, traduções e anotações no próprio estojo.',library:'Sua biblioteca',morningWalk:'Caminhada da manhã',travelNotes:'Notas de viagem',quickMessage:'Mensagem rápida',caseUsb:'USB-C · CARGA DO ESTOJO',closingEyebrow:'Um novo capítulo na comunicação',closingTitle:'Escreva a sua<br><em>própria história.</em>',backTop:'Voltar ao início <span>↑</span>',studentProject:'Projeto escolar conceitual',footerNote:'FEITA PARA O QUE VEM A SEGUIR · 2026',speakMorse:'Falar a palavra em código Morse',morseInput:'Digite uma palavra para converter em código Morse',reset:'Redefinir visualização',language:'Mudar idioma para inglês',sceneDescribed:'CENA DESCRITA',translationReady:'TRADUÇÃO PRONTA',demoComplete:'Demonstração concluída',cameraDemo:'Testar câmera',translateDemo:'Testar tradução',buyNow:'Comprar TUDOR PEN — só de brincadeira',buyEyebrow:'PROJETO ESCOLAR',buyTitle:'Que bom que gostou.',buyMessage:'A TUDOR PEN é um conceito escolar; esse botão é só uma brincadeira e não faz uma compra de verdade.',buyClose:'Continuar explorando'}
};
function setLanguage(next){language=next;document.documentElement.lang=next;document.title=next==='pt'?'TUDOR PEN — Uma nova forma de se comunicar':'TUDOR PEN — A new way to communicate';document.querySelectorAll('[data-copy]').forEach(element=>{const value=pageCopy[next][element.dataset.copy];if(value!==undefined)element.innerHTML=value;});const toggle=document.querySelector('#language-toggle');toggle.textContent=next==='en'?'PT':'EN';toggle.setAttribute('aria-label',pageCopy[next].language);document.querySelector('#morse-input').setAttribute('aria-label',pageCopy[next].morseInput);document.querySelector('#morse-button').setAttribute('aria-label',pageCopy[next].speakMorse);document.querySelector('#reset-view').setAttribute('aria-label',pageCopy[next].reset);document.querySelector('#product-canvas').setAttribute('aria-label',next==='pt'?'Modelo 3D interativo da TUDOR PEN. Arraste para girar e role para aproximar.':'Interactive 3D model of the TUDOR PEN. Drag to rotate and scroll to zoom.');document.querySelector('.usb-port').setAttribute('aria-label',next==='pt'?'Entrada USB-C':'USB-C port');document.querySelector('.pen-inspection').setAttribute('aria-label',next==='pt'?'Inspecionar a caneta':'Inspect the pen');document.querySelector('.case-inspection').setAttribute('aria-label',next==='pt'?'Inspecionar o estojo':'Inspect the case');if(caseScreenCanvas){drawCaseScreen();if(caseScreenTexture)caseScreenTexture.needsUpdate=true;}if(activeModel==='pen'){const key=viewerKey(focusName);setViewerText(key,key);}else focusCase(focusName);}
document.querySelector('#language-toggle').addEventListener('click',()=>setLanguage(language==='en'?'pt':'en'));
buildPen();buildCase();caseRoot.visible=false;scene.remove(caseRoot);switchModel('pen');
document.querySelectorAll('.pen-inspection .inspect-button').forEach(button=>button.addEventListener('click',()=>{if(activeModel!=='pen')switchModel('pen');const key=button.dataset.focus;if(key==='inside'&&openPen){focusView('whole');setActiveInspector('whole');return;}setActiveInspector(key);focusView(key);}));
document.querySelectorAll('.case-inspection .inspect-button').forEach(button=>button.addEventListener('click',()=>{if(activeModel!=='case')switchModel('case');focusCase(button.dataset.caseFocus);}));
document.querySelectorAll('.view-toggle').forEach(button=>button.addEventListener('click',()=>switchModel(button.dataset.model)));
document.querySelector('#reset-view').addEventListener('click',()=>{if(activeModel==='pen'){focusView('whole');setActiveInspector('whole');}else{focusCase('case-whole');}});
function zoomBy(factor){targetDistance=Math.max(2.2,Math.min(22,targetDistance*factor));document.querySelector('#zoom-level').textContent=`${Math.round(13/targetDistance*100)}%`;}
document.querySelector('#zoom-in').addEventListener('click',()=>zoomBy(.84));document.querySelector('#zoom-out').addEventListener('click',()=>zoomBy(1.19));
canvas.addEventListener('pointerdown',event=>{dragging=true;lastPointer={x:event.clientX,y:event.clientY};pointerOrigin={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{if(!dragging)return;theta-=(event.clientX-lastPointer.x)*.008;phi=Math.max(-1.35,Math.min(1.35,phi+(event.clientY-lastPointer.y)*.007));lastPointer={x:event.clientX,y:event.clientY};});
const raycaster=new THREE.Raycaster(),pointerNdc=new THREE.Vector2();
const partTooltip=document.querySelector('#part-tooltip');
const partLabels={
  en:[[/main circuit board/i,'Main circuit board'],[/processor/i,'Processor'],[/memory chip/i,'Memory chip'],[/wireless/i,'Wireless module'],[/battery/i,'Rechargeable battery'],[/ink reservoir/i,'Ink reservoir'],[/ink refill/i,'Ballpoint refill tube'],[/spring/i,'Refill spring'],[/microphone capsule/i,'Microphone'],[/microphone port/i,'Microphone opening'],[/camera sensor flex/i,'Camera flex cable'],[/camera sensor module/i,'Camera module'],[/camera optic|camera lens/i,'Camera lens'],[/laser diode|laser opening/i,'Laser module'],[/magnetic charging contact|matching pen connector/i,'Magnetic charging contact'],[/usb-c/i,'USB-C charging port'],[/opened barrel/i,'Opened pen barrel'],[/separated cap/i,'Removable cap'],[/detached tapered writing nose/i,'Removable writing tip'],[/writing ball/i,'Ballpoint tip'],[/camera inset button/i,'Camera button'],[/microphone inset button/i,'Microphone button'],[/morse inset button/i,'Morse button']],
  pt:[[/main circuit board/i,'Placa eletrônica principal'],[/processor/i,'Processador'],[/memory chip/i,'Memória'],[/wireless/i,'Módulo de comunicação'],[/battery/i,'Bateria recarregável'],[/ink reservoir/i,'Reservatório de tinta'],[/ink refill/i,'Tubo de tinta'],[/spring/i,'Mola do refil'],[/microphone capsule/i,'Microfone'],[/microphone port/i,'Entrada do microfone'],[/camera sensor flex/i,'Cabo flexível da câmera'],[/camera sensor module/i,'Módulo da câmera'],[/camera optic|camera lens/i,'Lente da câmera'],[/laser diode|laser opening/i,'Módulo do laser'],[/magnetic charging contact|matching pen connector/i,'Conector magnético'],[/usb-c/i,'Entrada USB-C'],[/opened barrel/i,'Corpo aberto da caneta'],[/separated cap/i,'Tampa removível'],[/detached tapered writing nose/i,'Ponta removível'],[/writing ball/i,'Esfera da ponta'],[/camera inset button/i,'Botão da câmera'],[/microphone inset button/i,'Botão do microfone'],[/morse inset button/i,'Botão Morse']]
};
function componentLabel(name){return (partLabels[language]||partLabels.en).find(([pattern])=>pattern.test(name))?.[1]||null;}
canvas.addEventListener('pointermove',event=>{
  if(dragging){partTooltip.hidden=true;return;}
  const rect=canvas.getBoundingClientRect();pointerNdc.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
  raycaster.setFromCamera(pointerNdc,camera);const root=activeModel==='pen'?penRoot:caseRoot;
  const hit=raycaster.intersectObject(root,true).find(item=>item.object.visible);const label=hit?componentLabel(hit.object.name):null;
  if(!label){partTooltip.hidden=true;return;}
  partTooltip.textContent=label;partTooltip.hidden=false;
  partTooltip.style.left=`${Math.max(5,Math.min(rect.width-190,event.clientX-rect.left+12))}px`;
  partTooltip.style.top=`${Math.max(5,Math.min(rect.height-42,event.clientY-rect.top+12))}px`;
});
canvas.addEventListener('pointerleave',()=>{partTooltip.hidden=true;});
canvas.addEventListener('pointerup',event=>{if(pointerOrigin&&Math.hypot(event.clientX-pointerOrigin.x,event.clientY-pointerOrigin.y)<5&&activeModel==='pen'){const rect=canvas.getBoundingClientRect();pointerNdc.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointerNdc,camera);const hit=raycaster.intersectObject(penRoot,true).find(item=>item.object.visible);if(hit){const name=hit.object.name.toLowerCase();const key=name.includes('morse')?'morse-button':name.includes('microphone icon')||name.includes('microphone recessed')?'microphone-button':name.includes('camera icon')||name.includes('camera recessed')?'camera-button':name.includes('laser aperture')||name.includes('flush top')||name.includes('microphone grille')?'sensors':null;if(key){setActiveInspector(key);focusView(key);}}}dragging=false;pointerOrigin=null;});canvas.addEventListener('pointercancel',()=>{dragging=false;pointerOrigin=null;});canvas.addEventListener('wheel',event=>{event.preventDefault();zoomBy(event.deltaY<0 ? 0.9 : 1.11);},{passive:false});
window.addEventListener('resize',()=>{renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));});
render();

document.querySelectorAll('[data-demo]').forEach(button=>button.addEventListener('click',()=>{const kind=button.dataset.demo,status=document.querySelector(`#${kind}-status`);status.textContent=kind==='camera'?pageCopy[language].sceneDescribed:pageCopy[language].translationReady;status.classList.add('live');button.innerHTML=`${pageCopy[language].demoComplete} <span>✓</span>`;setTimeout(()=>{status.classList.remove('live');button.innerHTML=`<span>${pageCopy[language][kind==='camera'?'tryCamera':'tryTranslator']}</span> <span>↗</span>`},1800);}));

const morse={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.'};
const input=document.querySelector('#morse-input'),output=document.querySelector('#morse-output');
function updateMorse(){const word=input.value.toUpperCase().replace(/[^A-Z0-9]/g,'');output.textContent=word?[...word].map(c=>morse[c]).join('  '):'··· −−− ···';}
input.addEventListener('input',updateMorse);document.querySelector('#morse-button').addEventListener('click',()=>{updateMorse();if(input.value&&'speechSynthesis'in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(input.value.toUpperCase()));}});
