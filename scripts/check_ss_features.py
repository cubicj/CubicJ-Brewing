from fontTools.ttLib import TTFont

font = TTFont('fonts/MatrixSansPrint-Regular.woff2')
gsub = font['GSUB']

for feat_rec in gsub.table.FeatureList.FeatureRecord:
    tag = feat_rec.FeatureTag
    if not tag.startswith('ss'):
        continue
    feat = feat_rec.Feature
    mappings = {}
    for lookup_idx in feat.LookupListIndex:
        lookup = gsub.table.LookupList.Lookup[lookup_idx]
        for sub_table in lookup.SubTable:
            if hasattr(sub_table, 'mapping'):
                mappings.update(sub_table.mapping)
    digits = {k: v for k, v in mappings.items() if k in ['zero','one','two','three','four','five','six','seven','eight','nine'] or k.startswith('colon')}
    print(f'{tag}: {len(mappings)} total mappings, digit-related: {digits}')
