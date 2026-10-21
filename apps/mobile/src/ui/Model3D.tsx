import { Image, type ImageSource } from 'expo-image';
import { Asset } from 'expo-asset';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// A rigged or static Meshy model, shown on a transparent GL surface.
// expo-gl has no web backend, so the browser preview shows the PNG render instead.

interface Props {
  /** The bundled .glb, from require('../../assets/models/x.glb'). */
  model: number;
  /** The PNG render shown on web, and while the model loads. */
  fallback: ImageSource;
  /** Play the first animation clip in a loop (walk, idle). */
  loop?: boolean;
  /** Turns the model slowly on its vertical axis. */
  spin?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
}

export function Model3D({ model, fallback, loop = false, spin = false, style, label }: Props) {
  if (Platform.OS === 'web') {
    return <Image source={fallback} style={style as StyleProp<ImageStyle>} contentFit="contain" accessibilityLabel={label} />;
  }
  return <Native model={model} fallback={fallback} loop={loop} spin={spin} style={style} label={label} />;
}

function Native({ model, fallback, loop, spin, style, label }: Props) {
  const [ready, setReady] = useState(false);
  const ctx = useRef<{ dispose?: () => void }>({});

  useEffect(() => () => ctx.current.dispose?.(), []);

  return (
    <View style={style} accessibilityLabel={label} accessibilityRole="image">
      <Image source={fallback} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} contentFit="contain" />
      <GLView
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
        onContextCreate={(gl) => {
          void setup(gl, model, { loop, spin }).then((d) => {
            ctx.current.dispose = d.dispose;
            setReady(true);
          });
        }}
      />
    </View>
  );
}

/** Loads the model, sets up a three.js scene on the GL context and starts the render loop. */
async function setup(gl: ExpoWebGLRenderingContext, model: number, opt: { loop?: boolean; spin?: boolean }) {
  const { width, height } = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };

  const renderer = new THREE.WebGLRenderer({
    canvas: { width, height, style: {}, addEventListener() {}, removeEventListener() {}, clientHeight: height, getContext: () => gl } as unknown as HTMLCanvasElement,
    context: gl,
    alpha: true,
  } as ConstructorParameters<typeof THREE.WebGLRenderer>[0]);
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);

  const asset = Asset.fromModule(model);
  await asset.downloadAsync();
  const bytes = await (await fetch(asset.localUri ?? asset.uri)).arrayBuffer();

  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
    loader.parse(bytes, '', resolve, reject);
  });

  const root = gltf.scene;
  scene.add(root);

  // Centre the model and frame it from the front, whatever its origin.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  root.position.sub(centre);
  const dist = (size.y / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);

  let mixer: THREE.AnimationMixer | null = null;
  if (opt.loop && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(gltf.animations[0]!).play();
  }

  let frame = 0;
  const clock = new THREE.Clock();
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    mixer?.update(dt);
    if (opt.spin) root.rotation.y += dt * 0.5;
    renderer.render(scene, camera);
    gl.endFrameEXP();
  };
  tick();

  return {
    dispose: () => {
      cancelAnimationFrame(frame);
      mixer?.stopAllAction();
      renderer.dispose();
    },
  };
}
