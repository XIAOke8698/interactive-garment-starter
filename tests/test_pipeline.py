import unittest,tempfile,json,sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'pipeline'))
from prepare import matte,prepare_frames

class PipelineTest(unittest.TestCase):
    def test_dark_green_print_stays_opaque(self):
        image=Image.new('RGB',(128,128),(0,200,0));image.paste((245,245,245),(20,10,110,120));image.paste((5,75,20),(40,40,80,80))
        out=matte(image);self.assertEqual(out.getpixel((0,0))[3],0);self.assertEqual(out.getpixel((60,60)),(5,75,20,255))
    def test_backing_is_removed_and_existing_alpha_preserved(self):
        image=Image.new('RGB',(64,64),(0,255,0));image.paste((230,220,205),(20,10,45,55))
        out=matte(image);self.assertEqual(out.getpixel((0,0))[3],0);self.assertEqual(out.getpixel((30,30))[3],255)
        rgba=Image.new('RGBA',(20,20),(80,90,100,110));self.assertEqual(matte(rgba).tobytes(),rgba.tobytes())
    def test_shared_geometry_and_exact_decoded_endpoints(self):
        m=json.loads((ROOT/'public/fixtures/tee/manifest.json').read_text());atlas=Image.open(ROOT/'public/fixtures/tee/atlas.webp').convert('RGBA');w,h,c=m['width'],m['height'],m['columns']
        images=[]
        for i in range(m['frameCount']):
            x=i%c*w;y=i//c*h;fg=atlas.crop((x,y,x+w,y+h));back=Image.new('RGB',(w,h),(0,255,0));back.paste(fg,(0,0),fg);images.append(back)
        work=ROOT/'work';work.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='garment-pipeline-test-',dir=work) as temporary:
            out=Path(temporary)/'output';prepare_frames(images,out,width=w,height=h,pivot=(192,12))
            packed=Image.open(out/'atlas.webp').convert('RGBA')
            for name,i in [('profile',0),('front',29)]:
                x=i%c*w;y=i//c*h;expected=packed.crop((x,y,x+w,y+h));actual=Image.open(out/(name+'.webp')).convert('RGBA');self.assertEqual(actual.tobytes(),expected.tobytes())
            self.assertEqual(packed.getpixel((0,0))[3],0);self.assertTrue((out/'key-review.jpg').is_file())
            receipt=json.loads((out/'manifest.json').read_text());self.assertEqual(receipt['frameCount'],30)

if __name__=='__main__':unittest.main()
