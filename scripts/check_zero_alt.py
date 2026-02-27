from fontTools.ttLib import TTFont

font = TTFont('fonts/MatrixSansPrint-Regular.woff2')
gsub = font['GSUB']

for feat_rec in gsub.table.FeatureList.FeatureRecord:
    tag = feat_rec.FeatureTag
    feat = feat_rec.Feature
    for lookup_idx in feat.LookupListIndex:
        lookup = gsub.table.LookupList.Lookup[lookup_idx]
        for sub_table in lookup.SubTable:
            if hasattr(sub_table, 'mapping'):
                if 'zero' in sub_table.mapping:
                    print(f'{tag} (lookup {lookup_idx}): zero -> {sub_table.mapping["zero"]}')
            elif hasattr(sub_table, 'alternates'):
                if 'zero' in sub_table.alternates:
                    print(f'{tag} (lookup {lookup_idx}): zero alternates -> {sub_table.alternates["zero"]}')
