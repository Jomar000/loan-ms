# Asset Optimization Tools

## OPUS (Audio)

https://opus-codec.org/downloads

`opusenc.exe --bitrate 96 --vbr <INPUT> <OUTPUT>.opus`

## libavif (Image)

https://github.com/AOMediaCodec/libavif/releases

`avifenc.exe --qcolor 80 --qalpha 100 -a tune=ssim -a end-usage=q --depth 10 --jobs all --speed 6 <INPUT> "${file%.*}".avif`

## FFmpeg (Video)

https://github.com/BtbN/FFmpeg-Builds/releases<br>
https://trac.ffmpeg.org/wiki/Encode/AV1<br>
https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/CommonQuestions.md
https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md

To MP4
`ffmpeg.exe -i <INPUT> -crf 38 -preset 4 -svtav1-params tune=2 -svtav1-params fast-decode=1 -c:v libsvtav1 -vf scale=640:-1 -movflags +faststart <OUTPUT>.mp4`

To YUV4MPEG
`ffmpeg.exe -i <INPUT> -strict -1 -f yuv4mpegpipe -pix_fmt yuva444p <OUTPUT>.y4m`

## Batch Operations

```
files=$(find . -type f)
for file in $files;
    do <COMMAND>
done
```
